#!/usr/bin/env node
import { closeSync, constants, fstatSync, linkSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { RULESET_VERSION, serializedRules } from './ai-editor.js';
import { parseCopySpec } from './copy-spec.js';
import type { Profile, ProfileV3, WritingBrief } from './contracts.js';
import { analyzeBatch, parseWritingBrief } from './editorial-packs.js';
import { clearLearning, composeLearning, inspectLearning, type LearningOptions, migrateLearningV2ToV3, profileFingerprint, ratifyLearningEvent, recordLearningInstruction, supersedeLearningEvent } from './learning.js';
import { cleanHygiene, finalOutputCheck, inspectHygiene } from './hygiene.js';
import { applyHiddenTextPolicy, inspectHiddenText, parseHiddenTextPolicy } from './hidden-text.js';
import { analyze, rewritePrompt, verify, verifyWithCopySpec } from './pipeline.js';
import { parseProfile } from './profile.js';
import { evaluateRewriteResponse, parseRewriteTask, prepareRewriteTask } from './rewrite-task.js';
import { parseJudgmentEnvelope, preparePostCandidateJudgment, preparePreEditJudgment, reducePostCandidate, reducePreEdit } from './judgment-task.js';
import { evaluateRebuildResponse, parseRebuildTask, prepareRebuildTask, writerRequestForRebuild } from './rebuild-task.js';
import type { ApprovalCapabilityEnvelopeV1, DeterministicVerificationArtifactV1, PreEditReduction, RecompositionPolicyV1, RewriteLifecycleArtifactV1, RewriteLifecycleBindingV1, RewriteReceipt, SemanticPolicy, SemanticReviewTaskV1, SemanticViolation } from './contracts.js';
import { canonicalJson, parseCanonicalJson } from './canonical-json.js';
import { finalizeLifecycle, inspectLifecycle, prepareLifecycle, recordApprovedLearning, submitSemanticVerdict, validateFinalApproval } from './lifecycle-adapter.js';
import { buildProfile } from './voice-dna.js';
import { loadApprovalContext } from './approval-context.js';
import { formatFactLintReport, lintFacts, type FactMetadata, type FactSource } from './fact-linter.js';

const usage = 'Commands: profile, analyze, hygiene, inspect-hidden-text, apply-hidden-text-policy, final-check, fact-lint, batch-analyze, rewrite-prompt, prepare-rewrite, apply-rewrite, prepare-judgment, reduce-judgment, prepare-rebuild, rebuild-writer-request, apply-rebuild, verify, verify-spec, lifecycle, learning, patterns, mcp';
const MAX_JSON_BYTES = 1024 * 1024;

function input(path: string): string {
  return path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
}

function parseBoundedJson(text: string): unknown {
  if (Buffer.byteLength(text, 'utf8') > MAX_JSON_BYTES) throw new Error('JSON input exceeds the byte limit.');
  const value: unknown = JSON.parse(text); canonicalJson(value); return value;
}
function readBoundedDescriptor(descriptor: number): string {
  const chunks: Buffer[] = []; let size = 0;
  while (size <= MAX_JSON_BYTES) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_JSON_BYTES + 1 - size));
    const count = readSync(descriptor, chunk, 0, chunk.length, null); if (!count) break;
    chunks.push(chunk.subarray(0, count)); size += count;
  }
  if (size > MAX_JSON_BYTES) throw new Error('JSON input exceeds the byte limit.');
  return Buffer.concat(chunks, size).toString('utf8');
}
function readJson(path: string): unknown {
  if (path === '-') return parseBoundedJson(readBoundedDescriptor(0));
  let descriptor: number | undefined;
  try { descriptor = openSync(path, constants.O_RDONLY); return parseBoundedJson(readBoundedDescriptor(descriptor)); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function capabilityArguments(args: string[]): { values: string[]; capability?: ApprovalCapabilityEnvelopeV1 } {
  const values: string[] = []; let source: { kind: 'stdin' } | { kind: 'file'; path: string } | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--capability-stdin') { if (source) throw new Error('Choose one capability source.'); source = { kind: 'stdin' }; continue; }
    if (args[index] === '--capability-file') { const path = args[index + 1]; if (source || !path || path.startsWith('--capability-')) throw new Error('Choose one capability source.'); source = { kind: 'file', path }; index += 1; continue; }
    values.push(args[index]);
  }
  if (!source) return { values };
  if (source.kind === 'stdin' && values.includes('-')) throw new Error('Capability stdin cannot be combined with another stdin input.');
  let raw: string;
  if (source.kind === 'stdin') raw = readBoundedDescriptor(0);
  else {
    let descriptor: number | undefined;
    try {
      descriptor = openSync(source.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); const before = fstatSync(descriptor);
      if (!before.isFile() || before.uid !== process.geteuid?.() || (before.mode & 0o077) !== 0 || before.nlink !== 1 || before.size > MAX_JSON_BYTES) throw new Error('Capability file is unavailable or unsafe.');
      raw = readBoundedDescriptor(descriptor); const after = fstatSync(descriptor);
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Capability file is unavailable or unsafe.');
    } catch { throw new Error('Capability file is unavailable or unsafe.'); }
    finally { if (descriptor !== undefined) closeSync(descriptor); }
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BYTES) throw new Error('JSON input exceeds the byte limit.');
  return { values, capability: parseCanonicalJson(Buffer.from(raw, 'utf8')) as ApprovalCapabilityEnvelopeV1 };
}

function rebuildArguments(args: string[]): { values: string[]; capability?: ApprovalCapabilityEnvelopeV1; recompositionPolicy?: RecompositionPolicyV1 } {
  const values: string[] = [];
  let policyPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--recomposition-policy') { values.push(args[index]!); continue; }
    const path = args[index + 1];
    if (policyPath || !path || path === '-' || path.startsWith('--')) throw new Error('Choose one recomposition policy file.');
    policyPath = path;
    index += 1;
  }
  const capability = capabilityArguments(values);
  return { ...capability, ...(policyPath ? { recompositionPolicy: readJson(policyPath) as RecompositionPolicyV1 } : {}) };
}

function readProfile(path: string): Profile {
  return parseProfile(JSON.parse(input(path)));
}

function requireProfileV3(profile: Profile): ProfileV3 {
  if (profile.version !== '3') throw new Error('This learning operation requires a Profile v3.');
  return profile;
}

function learningArguments(args: string[]): { values: string[]; options: LearningOptions } {
  const values: string[] = []; const options: LearningOptions = {};
  for (const argument of args) {
    if (!argument.startsWith('--')) { values.push(argument); continue; }
    const [name, ...parts] = argument.slice(2).split('='); const value = parts.join('=').trim();
    if (!value) throw new Error(`Learning option --${name} requires a value.`);
    if (name === 'mutation-id' && value.length <= 200) options.mutationId = value;
    else if (name === 'authority' && ['founder', 'team', 'system'].includes(value)) options.authority = value as LearningOptions['authority'];
    else if (name === 'provenance' && value.length <= 500) options.provenance = value;
    else if (name === 'weight' && Number.isFinite(Number(value)) && Number(value) > 0) options.weight = Number(value);
    else if (name === 'compatibility' && ['same-or-newer', 'exact'].includes(value)) options.compatibility = value as LearningOptions['compatibility'];
    else throw new Error(`Invalid learning option: --${name}=${value}`);
  }
  return { values, options };
}

function readBrief(path: string | undefined): WritingBrief | undefined {
  return path ? parseWritingBrief(JSON.parse(input(path))) : undefined;
}

function prepareContext(paths: string[]): { copySpec?: ReturnType<typeof parseCopySpec>; writingBrief?: WritingBrief } {
  let copySpec: ReturnType<typeof parseCopySpec> | undefined;
  let writingBrief: WritingBrief | undefined;
  for (const path of paths) {
    const value = JSON.parse(input(path));
    try {
      const parsed = parseCopySpec(value);
      if (copySpec) throw new Error('Prepare-rewrite accepts at most one CopySpec.');
      copySpec = parsed;
      continue;
    } catch (error) {
      if (error instanceof Error && error.message === 'Prepare-rewrite accepts at most one CopySpec.') throw error;
    }
    try {
      const parsed = parseWritingBrief(value);
      if (writingBrief) throw new Error('Prepare-rewrite accepts at most one WritingBrief.');
      writingBrief = parsed;
    } catch (error) {
      if (error instanceof Error && error.message === 'Prepare-rewrite accepts at most one WritingBrief.') throw error;
      throw new Error(`Expected a valid CopySpec or WritingBrief at ${path}.`);
    }
  }
  return { copySpec, writingBrief };
}

function json(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
function canonical(value: unknown): void { process.stdout.write(`${canonicalJson(value)}\n`); }

function profileArguments(args: string[]): { output: string; samples: string[]; avoid: string[] } {
  const [output, ...rest] = args;
  const samples: string[] = [];
  const avoid: string[] = [];
  for (const argument of rest) {
    if (argument.startsWith('--avoid=')) {
      const phrase = argument.slice('--avoid='.length).trim();
      if (!phrase) throw new Error('Avoid phrases must use --avoid=phrase.');
      avoid.push(phrase);
    } else {
      samples.push(argument);
    }
  }
  if (!output || samples.length < 2) throw new Error('Usage: hyv profile profile.json sample-a.md sample-b.md [sample-c.md] [--avoid=phrase]');
  return { output, samples, avoid };
}

function cleanedPath(path: string): string {
  const extension = extname(path);
  const stem = extension ? path.slice(0, -extension.length) : path;
  return `${stem}.cleaned${extension}`;
}

function hygieneArguments(args: string[]): { path: string; fix: boolean; output?: string } {
  const [path, ...options] = args;
  if (!path) throw new Error('Usage: hyv hygiene draft.md [--fix] [--output=cleaned.md]');
  let fix = false;
  let output: string | undefined;
  for (const option of options) {
    if (option === '--fix') fix = true;
    else if (option.startsWith('--output=')) output = option.slice('--output='.length).trim();
    else throw new Error('Usage: hyv hygiene draft.md [--fix] [--output=cleaned.md]');
  }
  if (output !== undefined && (!output || !fix)) throw new Error('--output requires --fix and a non-empty path.');
  return { path, fix, ...(output ? { output } : {}) };
}

function writeNewFileAtomically(path: string, text: string): void {
  const temporaryDirectory = mkdtempSync(join(dirname(resolve(path)), '.hyv-hygiene-'));
  const temporaryPath = join(temporaryDirectory, 'cleaned');
  let primaryError: unknown;
  try {
    writeFileSync(temporaryPath, text, 'utf8');
    try {
      linkSync(temporaryPath, path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(code ?? '')) throw error;
      throw new Error(`Atomic hygiene output is not supported by this filesystem: ${path}`);
    }
  } catch (error) {
    primaryError = (error as NodeJS.ErrnoException).code === 'EEXIST' ? new Error(`Hygiene output already exists: ${path}`) : error;
  }
  try {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  } catch (error) {
    if (!primaryError) console.error(`Warning: output was published, but temporary-file cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (primaryError) throw primaryError;
}

export async function runCli(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (command === 'profile') {
    const { output, samples, avoid } = profileArguments(rest);
    writeFileSync(output, `${JSON.stringify(buildProfile(samples.map(input), avoid), null, 2)}\n`);
    return 0;
  }
  if (command === 'analyze') {
    const [draft, profilePath, briefPath] = rest;
    if (!draft || !profilePath) throw new Error('Usage: hyv analyze draft.md profile.json [writing-brief.json]');
    json(analyze(input(draft), readProfile(profilePath), readBrief(briefPath)));
    return 0;
  }
  if (command === 'hygiene') {
    const { path, fix, output } = hygieneArguments(rest);
    if (fix && path === '-') throw new Error('hyv hygiene --fix requires a file path so the original can be preserved.');
    const text = input(path);
    if (!fix) {
      json(inspectHygiene(text));
      return 0;
    }
    const outputPath = output ?? cleanedPath(path);
    if (resolve(outputPath) === resolve(path)) throw new Error('Hygiene output must differ from the input path.');
    const result = cleanHygiene(text);
    writeNewFileAtomically(outputPath, result.cleaned);
    json({ ...result.report, changed: result.changed, changes: result.changes, outputPath });
    return 0;
  }
  if (command === 'inspect-hidden-text') {
    const [path, policyPath, ...extra] = rest;
    if (!path || extra.length) throw new Error('Usage: hyv inspect-hidden-text draft.md [policy.json]');
    json(inspectHiddenText(input(path), policyPath ? parseHiddenTextPolicy(readJson(policyPath)) : undefined));
    return 0;
  }
  if (command === 'apply-hidden-text-policy') {
    const [path, policyPath, output, ...extra] = rest;
    if (!path || !policyPath || !output || extra.length) throw new Error('Usage: hyv apply-hidden-text-policy draft.md policy.json output.md');
    if (path === '-' || resolve(path) === resolve(output)) throw new Error('Hidden-text output must differ from the input path.');
    const result = applyHiddenTextPolicy(input(path), parseHiddenTextPolicy(readJson(policyPath)));
    writeNewFileAtomically(output, result.output);
    json({ ...result, outputPath: output });
    return 0;
  }
  if (command === 'final-check') {
    const [path, ...options] = rest;
    if (!path || options.length) throw new Error('Usage: hyv final-check <path|->');
    const result = finalOutputCheck(input(path));
    if (!result.accepted) {
      console.error(JSON.stringify(result, null, 2));
      return 2;
    }
    if (result.changed) console.error(JSON.stringify({ changed: true, changes: result.changes }, null, 2));
    process.stdout.write(result.output);
    return 0;
  }
  if (command === 'fact-lint') {
    const [draftPath, ...options] = rest;
    const sources: FactSource[] = []; let metadata: FactMetadata | undefined; let strict = false; let human = false;
    if (!draftPath) throw new Error('Usage: hyv fact-lint <draft|-> --source=id:path [--source=id:path] [--metadata=metadata.json] [--strict] [--human]');
    for (const option of options) {
      if (option === '--strict') { strict = true; continue; }
      if (option === '--human') { human = true; continue; }
      if (option.startsWith('--source=')) {
        const value = option.slice('--source='.length); const separator = value.indexOf(':'); const id = value.slice(0, separator).trim(); const path = value.slice(separator + 1);
        if (separator < 1 || !id || !path) throw new Error('Sources must use --source=id:path.');
        sources.push({ id, text: input(path) }); continue;
      }
      if (option.startsWith('--metadata=')) { metadata = JSON.parse(input(option.slice('--metadata='.length))) as FactMetadata; continue; }
      throw new Error('Usage: hyv fact-lint <draft|-> --source=id:path [--source=id:path] [--metadata=metadata.json] [--strict] [--human]');
    }
    const report = lintFacts({ sources, draft: input(draftPath), metadata });
    if (human) console.log(formatFactLintReport(report)); else json(report);
    return strict && report.findings.some((item) => item.severity === 'error') ? 2 : 0;
  }
  if (command === 'batch-analyze') {
    if (rest.length < 2) throw new Error('Usage: hyv batch-analyze draft-a.md draft-b.md [draft-c.md]');
    json(analyzeBatch(rest.map(input)));
    return 0;
  }
  if (command === 'rewrite-prompt') {
    const [draft, profilePath, briefPath] = rest;
    if (!draft || !profilePath) throw new Error('Usage: hyv rewrite-prompt draft.md profile.json [writing-brief.json]');
    const profile = readProfile(profilePath);
    console.log(rewritePrompt(input(draft), profile, composeLearning(profile), readBrief(briefPath)));
    return 0;
  }
  if (command === 'prepare-rewrite') {
    const [draft, profilePath, output, ...contextPaths] = rest;
    if (!draft || !profilePath || !output) throw new Error('Usage: hyv prepare-rewrite draft.md profile.json task.json [copy-spec.json] [writing-brief.json]');
    const context = prepareContext(contextPaths);
    const task = prepareRewriteTask(input(draft), readProfile(profilePath), context.copySpec, context.writingBrief);
    writeFileSync(output, `${JSON.stringify(task, null, 2)}\n`);
    json({ version: task.version, fingerprint: task.fingerprint, eligibleSentenceIds: task.eligibleSentenceIds });
    return 0;
  }
  if (command === 'apply-rewrite') {
    const [taskPath, responsePath, profilePath] = rest;
    if (!taskPath || !responsePath || !profilePath) throw new Error('Usage: hyv apply-rewrite task.json response.json profile.json');
    const result = evaluateRewriteResponse(parseRewriteTask(JSON.parse(input(taskPath))), input(responsePath), readProfile(profilePath));
    json(result);
    return result.status === 'accepted' ? 0 : 2;
  }
  if (command === 'prepare-judgment') {
    const [stage, kind, draft, profilePath, output, candidatePath] = rest;
    if (!stage || !kind || !draft || !profilePath || !output) throw new Error('Usage: hyv prepare-judgment pre-edit|post-candidate kind draft.md profile.json task.json [candidate.md]');
    if (stage === 'post-candidate' && !candidatePath) throw new Error('Usage: hyv prepare-judgment post-candidate kind draft.md profile.json task.json candidate.md');
    const profile = readProfile(profilePath);
    const task = stage === 'pre-edit'
      ? preparePreEditJudgment(input(draft), profile, kind as 'triage' | 'argument' | 'form')
      : preparePostCandidateJudgment(input(draft), input(candidatePath ?? ''), profile, kind as 'argument' | 'polarity' | 'form' | 'flatness' | 'semantic');
    writeFileSync(output, `${JSON.stringify(task, null, 2)}\n`);
    json({ version: task.version, stage: task.stage, judgmentType: task.judgmentType, taskFingerprint: task.taskFingerprint });
    return 0;
  }
  if (command === 'reduce-judgment') {
    if (rest.length < 3) throw new Error('Usage: hyv reduce-judgment envelope.json envelope.json [envelope.json...]');
    const envelopes = rest.map((path) => parseJudgmentEnvelope(JSON.parse(input(path))));
    const stage = envelopes[0]?.stage;
    json(stage === 'pre-edit' ? reducePreEdit(envelopes) : reducePostCandidate(envelopes));
    return 0;
  }
  if (command === 'prepare-rebuild') {
    const { values, capability, recompositionPolicy } = rebuildArguments(rest);
    const [draft, profilePath, reductionPath, specPath, output, briefPath] = values;
    if (!draft || !profilePath || !reductionPath || !specPath || !output || !capability) {
      throw new Error('Usage: hyv prepare-rebuild draft.md profile.json reduction.json copy-spec.json task.json [writing-brief.json] [--recomposition-policy policy.json] (--capability-stdin|--capability-file path)');
    }
    const context = loadApprovalContext();
    const task = prepareRebuildTask(
      input(draft),
      readProfile(profilePath),
      readJson(reductionPath) as PreEditReduction,
      parseCopySpec(JSON.parse(input(specPath))),
      capability,
      context.trustStore,
      context.now,
      briefPath ? parseWritingBrief(JSON.parse(input(briefPath))) : undefined,
      recompositionPolicy,
    );
    writeFileSync(output, `${JSON.stringify(task, null, 2)}\n`);
    json({ version: task.version, fingerprint: task.fingerprint, recommendationFingerprint: task.recommendationFingerprint, authorizationFingerprint: task.authorizationFingerprint, ...(task.recompositionPolicy ? { recompositionPolicy: task.recompositionPolicy } : {}) });
    return 0;
  }
  if (command === 'apply-rebuild') {
    const { values, capability } = capabilityArguments(rest);
    const [taskPath, responsePath, profilePath, ...extra] = values;
    if (!taskPath || !responsePath || !profilePath || extra.length || !capability) throw new Error('Usage: hyv apply-rebuild task.json response.json profile.json (--capability-stdin|--capability-file path)');
    const context = loadApprovalContext();
    const result = evaluateRebuildResponse(parseRebuildTask(JSON.parse(input(taskPath))), input(responsePath), readProfile(profilePath), capability, context.trustStore, context.now);
    json(result);
    return result.status === 'accepted' ? 0 : 2;
  }
  if (command === 'rebuild-writer-request') {
    const [taskPath, output, ...extra] = rest;
    if (!taskPath || !output || extra.length) throw new Error('Usage: hyv rebuild-writer-request task.json writer-request.json');
    const request = writerRequestForRebuild(parseRebuildTask(JSON.parse(input(taskPath))));
    writeFileSync(output, `${JSON.stringify(request, null, 2)}\n`);
    json({ version: request.version, taskFingerprint: request.taskFingerprint, copySpecFingerprint: request.copySpecFingerprint, ...(request.recompositionPolicyFingerprint ? { recompositionPolicyFingerprint: request.recompositionPolicyFingerprint } : {}) });
    return 0;
  }
  if (command === 'verify') {
    const [original, candidate, profilePath, briefPath] = rest;
    if (!original || !candidate || !profilePath) throw new Error('Usage: hyv verify original.md candidate.md profile.json [writing-brief.json]');
    const profile = readProfile(profilePath);
    const originalText = input(original);
    const candidateText = input(candidate);
    const result = verify(originalText, candidateText, profile, readBrief(briefPath));
    json(result);
    return result.passed ? 0 : 2;
  }
  if (command === 'verify-spec') {
    const [original, candidate, profilePath, specPath, briefPath] = rest;
    if (!original || !candidate || !profilePath || !specPath) throw new Error('Usage: hyv verify-spec original.md candidate.md profile.json copy-spec.json [writing-brief.json]');
    const profile = readProfile(profilePath);
    const candidateText = input(candidate);
    const result = verifyWithCopySpec(input(original), candidateText, profile, parseCopySpec(JSON.parse(input(specPath))), readBrief(briefPath));
    json(result);
    return result.passed ? 0 : 2;
  }
  if (command === 'lifecycle') {
    const [action, ...raw] = rest;
    if (action === 'prepare-semantic') {
      const [deterministicPath, bindingPath, receiptPath, policy, violationsPath, output, ...extra] = raw;
      if (!deterministicPath || !bindingPath || !receiptPath || !policy || !violationsPath || !output || extra.length || !['normal', 'high_assurance'].includes(policy)) throw new Error('Usage: hyv lifecycle prepare-semantic deterministic.json binding.json receipt.json <normal|high_assurance> violations.json output.json');
      if (policy === 'high_assurance') throw new Error('High-assurance semantic review requires a trusted embedding.');
      const result = prepareLifecycle(readJson(deterministicPath) as DeterministicVerificationArtifactV1, readJson(bindingPath) as RewriteLifecycleBindingV1, readJson(receiptPath) as RewriteReceipt, policy as SemanticPolicy, readJson(violationsPath) as SemanticViolation[]);
      const serialized = canonicalJson(result); writeFileSync(output, `${serialized}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); process.stdout.write(`${serialized}\n`); return 0;
    }
    if (action === 'submit-verdict') {
      const [artifactPath, taskPath, evaluatorId, verdictPath, ...extra] = raw;
      if (!artifactPath || !taskPath || !evaluatorId || !verdictPath || extra.length) throw new Error('Usage: hyv lifecycle submit-verdict artifact.json task.json evaluator-id verdict.json');
      const artifact = readJson(artifactPath) as RewriteLifecycleArtifactV1; const task = readJson(taskPath) as SemanticReviewTaskV1;
      if (task.policy !== 'normal') throw new Error('High-assurance semantic review requires a trusted embedding.');
      const result = submitSemanticVerdict(artifact, task, evaluatorId, readJson(verdictPath), loadApprovalContext()); canonical(result.ok ? result.artifact : { error: result.error }); return result.ok && result.artifact.status === 'ready_for_human_review' ? 0 : 2;
    }
    if (action === 'inspect') {
      const [artifactPath, ...extra] = raw; if (!artifactPath || extra.length) throw new Error('Usage: hyv lifecycle inspect artifact.json'); canonical(inspectLifecycle(readJson(artifactPath) as RewriteLifecycleArtifactV1)); return 0;
    }
    if (action === 'validate-final-approval' || action === 'finalize') {
      const { values, capability } = capabilityArguments(raw);
      if (action === 'validate-final-approval') {
        const [artifactPath, ...extra] = values; if (!artifactPath || extra.length || !capability) throw new Error('Usage: hyv lifecycle validate-final-approval artifact.json (--capability-stdin|--capability-file path)');
        const result = validateFinalApproval(readJson(artifactPath) as RewriteLifecycleArtifactV1, capability, loadApprovalContext()); canonical(result); return result.ok ? 0 : 2;
      }
      const [artifactPath, decisionPath, ...extra] = values; if (!artifactPath || !decisionPath || extra.length) throw new Error('Usage: hyv lifecycle finalize artifact.json decision.json [--capability-stdin|--capability-file path]');
      const decision = readJson(decisionPath) as { evaluatorId: string; decision: 'approve' | 'reject' }; if (decision.decision === 'approve' && !capability) throw new Error('Approval requires a capability.'); if (decision.decision === 'reject' && capability) throw new Error('Rejection does not accept a capability.');
      const result = finalizeLifecycle(readJson(artifactPath) as RewriteLifecycleArtifactV1, decision, loadApprovalContext(), capability); canonical(result.ok ? result.artifact : { error: result.error }); return result.ok && result.artifact.status === 'approved' ? 0 : 2;
    }
    throw new Error('Usage: hyv lifecycle <prepare-semantic|submit-verdict|inspect|validate-final-approval|finalize> ...');
  }
  if (command === 'learning') {
    const [action, ...raw] = rest;
    if (action === 'record-approved') {
      const { values, capability } = capabilityArguments(raw);
      const [readyPath, approvedPath, originalPath, candidatePath, profilePath, decisionPath, ...contextPaths] = values;
      if (!readyPath || !approvedPath || !originalPath || !candidatePath || !profilePath || !decisionPath || !capability) throw new Error('Usage: hyv learning record-approved ready.json approved.json original.md candidate.md profile.json decision.json [copy-spec.json] [writing-brief.json] (--capability-stdin|--capability-file path)');
      const context = prepareContext(contextPaths); const status = recordApprovedLearning({ ready: readJson(readyPath) as RewriteLifecycleArtifactV1, approved: readJson(approvedPath) as RewriteLifecycleArtifactV1, decision: readJson(decisionPath) as { evaluatorId: string; decision: 'approve' }, capability, source: input(originalPath), candidate: input(candidatePath), profile: readProfile(profilePath), context: loadApprovalContext(), copySpec: context.copySpec, writingBrief: context.writingBrief });
      canonical({ status }); return status === 'write_failed' ? 2 : 0;
    }
    const { values, options } = learningArguments(raw);
    const [profilePath, ...operands] = values;
    if (!action || !profilePath) throw new Error('Usage: hyv learning <show|inspect|add|record|ratify|supersede|migrate|clear> profile.json [value] [options]');
    const profile = readProfile(profilePath);
    if (action === 'show') {
      json({ profile: profileFingerprint(profile), preferences: composeLearning(profile, options) });
      return 0;
    }
    if (action === 'inspect') {
      if (Object.keys(options).length) throw new Error('Usage: hyv learning inspect profile.json');
      json(inspectLearning(profile)); return 0;
    }
    if (action === 'add' || action === 'record') {
      const text = operands.join(' ').trim();
      if (!text) throw new Error('Usage: hyv learning record profile.json "instruction" [options]');
      const result = recordLearningInstruction(profile, text, options);
      json(action === 'add' ? { added: result.status === 'recorded' } : result);
      return 0;
    }
    if (action === 'ratify' || action === 'supersede') {
      const [eventId, ...extra] = operands;
      if (!eventId || extra.length) throw new Error(`Usage: hyv learning ${action} profile.json event-id [options]`);
      json(action === 'ratify' ? ratifyLearningEvent(requireProfileV3(profile), eventId, options) : supersedeLearningEvent(requireProfileV3(profile), eventId, options));
      return 0;
    }
    if (action === 'migrate') {
      const [targetPath, ...extra] = operands;
      if (!targetPath || extra.length || profile.version !== '2') throw new Error('Usage: hyv learning migrate source-v2.json target-v3.json [options]');
      json(migrateLearningV2ToV3(profile, requireProfileV3(readProfile(targetPath)), options));
      return 0;
    }
    if (action === 'clear') {
      if (operands.length || Object.keys(options).length) throw new Error('Usage: hyv learning clear profile.json');
      json({ cleared: clearLearning(profile) });
      return 0;
    }
    throw new Error('Usage: hyv learning <show|inspect|add|record|ratify|supersede|migrate|clear> profile.json [value] [options]');
  }
  if (command === 'patterns') {
    json({ version: RULESET_VERSION, rules: serializedRules() });
    return 0;
  }
  if (command === 'mcp') {
    if (rest.length > 0) throw new Error('Usage: hyv mcp');
    await import('./mcp.js');
    return 0;
  }
  throw new Error(`${usage}.`);
}

void (async () => {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
})();

import { parseCopySpec } from '../copy-spec.js';
import { composeLearning } from '../learning.js';
import { rewritePrompt } from '../pipeline.js';
import { evaluateRewriteResponse, parseRewriteTask, prepareRewriteTask } from '../rewrite-task.js';
import { parseJudgmentEnvelope, preparePostCandidateJudgment, preparePreEditJudgment, reducePostCandidate, reducePreEdit } from '../judgment-task.js';
import { evaluateRebuildResponse, parseRebuildTask, prepareRebuildTask, writerRequestForRebuild } from '../rebuild-task.js';
import type { ApprovalCapabilityEnvelopeV1, PreEditReduction, RecompositionPolicyV1 } from '../contracts.js';
import { loadApprovalContext } from '../approval-context.js';
import { findWritingExamples, type LocalWritingExampleInput } from '../writing-examples.js';
import { input, readJson, capabilityArguments, readProfile, readBrief, prepareContext, json, writeJson } from './io.js';

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

export function runRewritePrompt(args: string[]): number {
  const [draft, profilePath, ...rest] = args;
  const exampleOption = rest.find((value) => value.startsWith('--examples-json='));
  const briefPaths = rest.filter((value) => !value.startsWith('--'));
  const briefPath = briefPaths[0];
  if (!draft || !profilePath || briefPaths.length > 1 || rest.some((value) => value.startsWith('--') && !value.startsWith('--examples-json='))) throw new Error('Usage: hyv rewrite-prompt draft.md profile.json [writing-brief.json] [--examples-json=local-examples.json]');
  const profile = readProfile(profilePath);
  const examplesValue = exampleOption ? readJson(exampleOption.slice('--examples-json='.length)) : undefined;
  if (examplesValue !== undefined && (!Array.isArray(examplesValue) || !examplesValue.every((item) => item && typeof item === 'object' && typeof (item as { basename?: unknown }).basename === 'string' && typeof (item as { text?: unknown }).text === 'string'))) throw new Error('Local examples must be a JSON array of { basename, text } values.');
  const draftText = input(draft);
  console.log(rewritePrompt(draftText, profile, composeLearning(profile), readBrief(briefPath), examplesValue ? findWritingExamples(draftText, examplesValue as LocalWritingExampleInput[]) : []));
  return 0;
}

export function runPrepareRewrite(args: string[]): number {
  const [draft, profilePath, output, ...contextPaths] = args;
  if (!draft || !profilePath || !output) throw new Error('Usage: hyv prepare-rewrite draft.md profile.json task.json [copy-spec.json] [writing-brief.json]');
  const context = prepareContext(contextPaths);
  const task = prepareRewriteTask(input(draft), readProfile(profilePath), context.copySpec, context.writingBrief);
  writeJson(output, task);
  json({ version: task.version, fingerprint: task.fingerprint, eligibleSentenceIds: task.eligibleSentenceIds });
  return 0;
}

export function runApplyRewrite(args: string[]): number {
  const [taskPath, responsePath, profilePath] = args;
  if (!taskPath || !responsePath || !profilePath) throw new Error('Usage: hyv apply-rewrite task.json response.json profile.json');
  const result = evaluateRewriteResponse(parseRewriteTask(JSON.parse(input(taskPath))), input(responsePath), readProfile(profilePath));
  json(result);
  return result.status === 'accepted' ? 0 : 2;
}

export function runPrepareJudgment(args: string[]): number {
  const [stage, kind, draft, profilePath, output, candidatePath] = args;
  if (!stage || !kind || !draft || !profilePath || !output) throw new Error('Usage: hyv prepare-judgment pre-edit|post-candidate kind draft.md profile.json task.json [candidate.md]');
  if (stage === 'post-candidate' && !candidatePath) throw new Error('Usage: hyv prepare-judgment post-candidate kind draft.md profile.json task.json candidate.md');
  const profile = readProfile(profilePath);
  const task = stage === 'pre-edit'
    ? preparePreEditJudgment(input(draft), profile, kind as 'triage' | 'argument' | 'form')
    : preparePostCandidateJudgment(input(draft), input(candidatePath ?? ''), profile, kind as 'argument' | 'polarity' | 'form' | 'flatness' | 'semantic');
  writeJson(output, task);
  json({ version: task.version, stage: task.stage, judgmentType: task.judgmentType, taskFingerprint: task.taskFingerprint });
  return 0;
}

export function runReduceJudgment(args: string[]): number {
  if (args.length < 3) throw new Error('Usage: hyv reduce-judgment envelope.json envelope.json [envelope.json...]');
  const envelopes = args.map((path) => parseJudgmentEnvelope(JSON.parse(input(path))));
  json(envelopes[0]?.stage === 'pre-edit' ? reducePreEdit(envelopes) : reducePostCandidate(envelopes));
  return 0;
}

export function runPrepareRebuild(args: string[]): number {
  const { values, capability, recompositionPolicy } = rebuildArguments(args);
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
    readBrief(briefPath),
    recompositionPolicy,
  );
  writeJson(output, task);
  json({ version: task.version, fingerprint: task.fingerprint, recommendationFingerprint: task.recommendationFingerprint, authorizationFingerprint: task.authorizationFingerprint, ...(task.recompositionPolicy ? { recompositionPolicy: task.recompositionPolicy } : {}) });
  return 0;
}

export function runApplyRebuild(args: string[]): number {
  const { values, capability } = capabilityArguments(args);
  const [taskPath, responsePath, profilePath, ...extra] = values;
  if (!taskPath || !responsePath || !profilePath || extra.length || !capability) throw new Error('Usage: hyv apply-rebuild task.json response.json profile.json (--capability-stdin|--capability-file path)');
  const context = loadApprovalContext();
  const result = evaluateRebuildResponse(parseRebuildTask(JSON.parse(input(taskPath))), input(responsePath), readProfile(profilePath), capability, context.trustStore, context.now);
  json(result);
  return result.status === 'accepted' ? 0 : 2;
}

export function runRebuildWriterRequest(args: string[]): number {
  const [taskPath, output, ...extra] = args;
  if (!taskPath || !output || extra.length) throw new Error('Usage: hyv rebuild-writer-request task.json writer-request.json');
  const request = writerRequestForRebuild(parseRebuildTask(JSON.parse(input(taskPath))));
  writeJson(output, request);
  json({ version: request.version, taskFingerprint: request.taskFingerprint, copySpecFingerprint: request.copySpecFingerprint, ...(request.recompositionPolicyFingerprint ? { recompositionPolicyFingerprint: request.recompositionPolicyFingerprint } : {}) });
  return 0;
}

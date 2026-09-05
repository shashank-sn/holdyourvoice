import { linkSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { RULESET_VERSION, serializedRules } from '../ai-editor.js';
import { parseCopySpec } from '../copy-spec.js';
import { analyzeBatch } from '../editorial-packs.js';
import { cleanHygiene, finalOutputCheck, inspectHygiene } from '../hygiene.js';
import { applyHiddenTextPolicy, inspectHiddenText, parseHiddenTextPolicy } from '../hidden-text.js';
import { analyze, verify, verifyWithCopySpec } from '../pipeline.js';
import { formatFactLintReport, lintFacts, type FactMetadata, type FactSource } from '../fact-linter.js';
import { lintLogic } from '../logic-linter.js';
import { inspectDeliveryIntegrity, parseDeliveryIntegrityPolicy } from '../delivery-integrity.js';
import { evaluateStrictQuality } from '../strict-quality.js';
import { normalizeFinding, parseSurfacePolicy } from '../disposition.js';
import { input, readJson, readProfile, readBrief, json } from './io.js';

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

export function runDeliveryCheck(args: string[]): number {
  const [path, policyPath, ...extra] = args;
  if (!path || extra.length) throw new Error('Usage: hyv delivery-check <path|-> [policy.json]');
  const report = inspectDeliveryIntegrity(input(path), policyPath ? parseDeliveryIntegrityPolicy(readJson(policyPath)) : undefined, process.cwd());
  json(report);
  return report.passed ? 0 : 2;
}

export function runAnalyze(args: string[]): number {
  const [draft, profilePath, briefPath] = args;
  if (!draft || !profilePath) throw new Error('Usage: hyv analyze draft.md profile.json [writing-brief.json]');
  json(analyze(input(draft), readProfile(profilePath), readBrief(briefPath)));
  return 0;
}

export function runStrictCheck(args: string[]): number {
  const [draft, profilePath, ...samplePaths] = args;
  if (!draft || !profilePath || samplePaths.length < 2) throw new Error('Usage: hyv strict-check draft.md profile-v3.json sample-a.md sample-b.md [sample-c.md ...]');
  const report = evaluateStrictQuality(input(draft), readProfile(profilePath), samplePaths.map(input));
  json(report);
  return report.disposition === 'strict-ready' ? 0 : 2;
}

export function runHygiene(args: string[]): number {
  const { path, fix, output } = hygieneArguments(args);
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

export function runInspectHiddenText(args: string[]): number {
  const [path, policyPath, ...extra] = args;
  if (!path || extra.length) throw new Error('Usage: hyv inspect-hidden-text draft.md [policy.json]');
  json(inspectHiddenText(input(path), policyPath ? parseHiddenTextPolicy(readJson(policyPath)) : undefined));
  return 0;
}

export function runApplyHiddenTextPolicy(args: string[]): number {
  const [path, policyPath, output, ...extra] = args;
  if (!path || !policyPath || !output || extra.length) throw new Error('Usage: hyv apply-hidden-text-policy draft.md policy.json output.md');
  if (path === '-' || resolve(path) === resolve(output)) throw new Error('Hidden-text output must differ from the input path.');
  const result = applyHiddenTextPolicy(input(path), parseHiddenTextPolicy(readJson(policyPath)));
  writeNewFileAtomically(output, result.output);
  json({ ...result, outputPath: output });
  return 0;
}

export function runFinalCheck(args: string[]): number {
  const [path, ...options] = args;
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

export function runFactLint(args: string[]): number {
  const [draftPath, ...options] = args;
  const sources: FactSource[] = [];
  let metadata: FactMetadata | undefined;
  let strict = false;
  let human = false;
  if (!draftPath) throw new Error('Usage: hyv fact-lint <draft|-> --source=id:path [--source=id:path] [--metadata=metadata.json] [--strict] [--human]');
  for (const option of options) {
    if (option === '--strict') { strict = true; continue; }
    if (option === '--human') { human = true; continue; }
    if (option.startsWith('--source=')) {
      const value = option.slice('--source='.length);
      const separator = value.indexOf(':');
      const id = value.slice(0, separator).trim();
      const path = value.slice(separator + 1);
      if (separator < 1 || !id || !path) throw new Error('Sources must use --source=id:path.');
      sources.push({ id, text: input(path) });
      continue;
    }
    if (option.startsWith('--metadata=')) {
      metadata = JSON.parse(input(option.slice('--metadata='.length))) as FactMetadata;
      continue;
    }
    throw new Error('Usage: hyv fact-lint <draft|-> --source=id:path [--source=id:path] [--metadata=metadata.json] [--strict] [--human]');
  }
  const report = lintFacts({ sources, draft: input(draftPath), metadata });
  if (human) console.log(formatFactLintReport(report)); else json(report);
  return strict && report.findings.some((item) => item.severity === 'error') ? 2 : 0;
}

export function runLogicLint(args: string[]): number {
  const [draftPath, briefPath, ...extra] = args;
  if (!draftPath || extra.length) throw new Error('Usage: hyv logic-lint <draft|-> [writing-brief.json]');
  const report = lintLogic(input(draftPath), readBrief(briefPath));
  json(report);
  return report.passed ? 0 : 2;
}

export function runBatchAnalyze(args: string[]): number {
  if (args.length < 2) throw new Error('Usage: hyv batch-analyze draft-a.md draft-b.md [draft-c.md]');
  json(analyzeBatch(args.map(input)));
  return 0;
}

export function runVerify(args: string[]): number {
  const [original, candidate, profilePath, briefPath] = args;
  if (!original || !candidate || !profilePath) throw new Error('Usage: hyv verify original.md candidate.md profile.json [writing-brief.json]');
  const profile = readProfile(profilePath);
  const originalText = input(original);
  const candidateText = input(candidate);
  const result = verify(originalText, candidateText, profile, readBrief(briefPath));
  json(result);
  return result.passed ? 0 : 2;
}

export function runVerifySpec(args: string[]): number {
  const [original, candidate, profilePath, specPath, briefPath] = args;
  if (!original || !candidate || !profilePath || !specPath) throw new Error('Usage: hyv verify-spec original.md candidate.md profile.json copy-spec.json [writing-brief.json]');
  const profile = readProfile(profilePath);
  const candidateText = input(candidate);
  const result = verifyWithCopySpec(input(original), candidateText, profile, parseCopySpec(JSON.parse(input(specPath))), readBrief(briefPath));
  json(result);
  return result.passed ? 0 : 2;
}

export function runPatterns(): number {
  json({ version: RULESET_VERSION, rules: serializedRules() });
  return 0;
}

export function runDispositions(args: string[]): number {
  const [draft, profilePath, briefPath, surfacePolicyPath] = args;
  if (!draft || !profilePath) throw new Error('Usage: hyv dispositions draft.md profile.json [writing-brief.json]');
  const report = analyze(input(draft), readProfile(profilePath), readBrief(briefPath));
  const policy = surfacePolicyPath ? parseSurfacePolicy(readJson(surfacePolicyPath)) : undefined;
  json({ version: '1', findings: [report.voiceDna, report.aiEditor, report.editorial].flatMap((engine) => engine?.findings.map((finding) => normalizeFinding(finding, policy)) ?? []) });
  return 0;
}

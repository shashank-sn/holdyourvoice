import { createHash } from 'node:crypto';
import type { CopySpec, Profile, RewriteApplyResult, RewriteEvaluation, RewriteFailure, RewriteReplacement, RewriteResponse, RewriteTask, WritingBrief } from './contracts.js';
import { parseWritingBrief } from './editorial-packs.js';
import { rewritePrompt, verify, verifyWithCopySpec } from './pipeline.js';
import { sentences } from './text.js';

const MAX_RESPONSE_BYTES = 100_000;
const MAX_REPLACEMENTS = 100;
const MAX_REPLACEMENT_CHARACTERS = 10_000;

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function failure(code: RewriteFailure['code'], message: string, path?: string): RewriteFailure {
  return { code, message, ...(path ? { path } : {}) };
}

function responseFingerprint(response: unknown): string {
  return fingerprint(response);
}

function parseJson(value: string): unknown | RewriteFailure {
  if (Buffer.byteLength(value) > MAX_RESPONSE_BYTES) return failure('response_too_large', `Response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
  try {
    return JSON.parse(value);
  } catch {
    return failure('invalid_json', 'Response must be valid JSON.');
  }
}

function isFailure(value: unknown): value is RewriteFailure {
  return typeof value === 'object' && value !== null && 'code' in value;
}

function parseResponse(value: unknown): RewriteResponse | RewriteFailure {
  const raw = typeof value === 'string' ? parseJson(value) : value;
  if (isFailure(raw)) return raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return failure('invalid_response_shape', 'Response must be an object.');
  const response = raw as Partial<RewriteResponse>;
  if (response.version !== '1') return failure('invalid_response_version', 'Response version must be "1".', 'version');
  if (typeof response.taskFingerprint !== 'string' || response.taskFingerprint.length !== 64) return failure('invalid_response_shape', 'Response must include the task fingerprint.', 'taskFingerprint');
  if (!Array.isArray(response.replacements)) return failure('invalid_response_shape', 'Response replacements must be an array.', 'replacements');
  if (response.replacements.length > MAX_REPLACEMENTS) return failure('invalid_response_shape', `Response may include at most ${MAX_REPLACEMENTS} replacements.`, 'replacements');
  for (const [index, replacement] of response.replacements.entries()) {
    if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement) || !Number.isInteger((replacement as RewriteReplacement).sentenceId) || typeof (replacement as RewriteReplacement).text !== 'string') {
      return failure('invalid_response_shape', 'Every replacement requires an integer sentenceId and string text.', `replacements[${index}]`);
    }
    if (!(replacement as RewriteReplacement).text.trim() || (replacement as RewriteReplacement).text.length > MAX_REPLACEMENT_CHARACTERS) {
      return failure('invalid_replacement_text', `Replacement text must contain at most ${MAX_REPLACEMENT_CHARACTERS} characters.`, `replacements[${index}].text`);
    }
  }
  return response as RewriteResponse;
}

function repairStringifiedReplacements(value: unknown): { value: unknown; adapterId?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { value };
  const raw = value as Record<string, unknown>;
  if (typeof raw.replacements !== 'string') return { value };
  try {
    const replacements = JSON.parse(raw.replacements);
    if (!Array.isArray(replacements)) return { value };
    return { value: { ...raw, replacements }, adapterId: 'stringified_replacements_v1' };
  } catch {
    return { value };
  }
}

function repairFencedJson(value: unknown): { value: unknown; adapterId?: string } {
  if (typeof value !== 'string') return { value };
  const match = value.match(/^```json\s*\n([\s\S]*?)\n```\s*$/i);
  return match ? { value: match[1], adapterId: 'fenced_json_v1' } : { value };
}

export function prepareRewriteTask(draft: string, profile: Profile, copySpec?: CopySpec, writingBrief?: WritingBrief): RewriteTask {
  const analysis = rewritePrompt(draft, profile, [], writingBrief);
  const mapped = sentences(draft);
  const eligibleSentenceIds = new Set([
    ...analysis.matchAll(/^- Sentence (\d+) \[/gm),
  ].map((match) => Number(match[1])));
  const taskBase = {
    version: '1' as const,
    draft,
    sentences: mapped.map((sentence) => ({ id: sentence.index, text: sentence.text, eligible: eligibleSentenceIds.has(sentence.index) })),
    eligibleSentenceIds: [...eligibleSentenceIds].sort((left, right) => left - right),
    prompt: analysis,
    ...(copySpec ? { copySpec } : {}),
    ...(writingBrief ? { writingBrief } : {}),
  };
  return { ...taskBase, fingerprint: fingerprint(taskBase) };
}

export function parseRewriteTask(value: unknown): RewriteTask {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Rewrite task must be an object.');
  const task = value as Partial<RewriteTask>;
  if (task.version !== '1' || typeof task.fingerprint !== 'string' || typeof task.draft !== 'string' || typeof task.prompt !== 'string' || !Array.isArray(task.sentences) || !Array.isArray(task.eligibleSentenceIds)) {
    throw new Error('Rewrite task does not match version 1.');
  }
  const { fingerprint: suppliedFingerprint, ...base } = task;
  if (fingerprint(base) !== suppliedFingerprint) throw new Error('Rewrite task fingerprint does not match its contents.');
  if (task.writingBrief !== undefined) parseWritingBrief(task.writingBrief);
  return task as RewriteTask;
}

function rejected(task: RewriteTask, raw: unknown, failures: RewriteFailure[], adapterIds: string[] = []): RewriteApplyResult {
  return { status: 'repairable', failures, receipt: { version: '1', taskFingerprint: task.fingerprint, responseFingerprint: responseFingerprint(raw), adapterIds } };
}

export function applyRewriteResponse(task: RewriteTask, raw: unknown): RewriteApplyResult {
  const source = typeof raw === 'string' ? parseJson(raw) : raw;
  const parsed = isFailure(source) ? source : parseResponse(source);
  const fenced = isFailure(parsed) && parsed.code === 'invalid_json' ? repairFencedJson(raw) : { value: source };
  const repaired = isFailure(parsed) && parsed.code === 'invalid_response_shape' ? repairStringifiedReplacements(source) : fenced;
  const response = repaired.adapterId ? parseResponse(repaired.value) : parsed;
  const adapterIds = repaired.adapterId ? [repaired.adapterId] : [];
  if (isFailure(response)) return rejected(task, raw, [response], adapterIds);
  if (response.taskFingerprint !== task.fingerprint) return rejected(task, raw, [failure('task_fingerprint_mismatch', 'Response task fingerprint does not match this task.', 'taskFingerprint')], adapterIds);
  const seen = new Set<number>();
  const sentenceMap = new Map(task.sentences.map((sentence) => [sentence.id, sentence]));
  for (const [index, replacement] of response.replacements.entries()) {
    if (seen.has(replacement.sentenceId)) return rejected(task, raw, [failure('duplicate_sentence_id', 'Each sentence may be replaced once.', `replacements[${index}].sentenceId`)], adapterIds);
    seen.add(replacement.sentenceId);
    const sentence = sentenceMap.get(replacement.sentenceId);
    if (!sentence) return rejected(task, raw, [failure('unknown_sentence_id', 'Replacement sentenceId is not in this task.', `replacements[${index}].sentenceId`)], adapterIds);
    if (!sentence.eligible) return rejected(task, raw, [failure('ineligible_sentence_id', 'Only flagged sentences may be replaced.', `replacements[${index}].sentenceId`)], adapterIds);
  }
  const sourceSentences = sentences(task.draft);
  const replacements = new Map(response.replacements.map((replacement) => [replacement.sentenceId, replacement.text.trim()]));
  let candidate = task.draft;
  for (const sentence of [...sourceSentences].reverse()) {
    const replacement = replacements.get(sentence.index);
    if (replacement !== undefined) candidate = `${candidate.slice(0, sentence.start)}${replacement}${candidate.slice(sentence.end)}`;
  }
  return { status: 'accepted', candidate, failures: [], receipt: { version: '1', taskFingerprint: task.fingerprint, responseFingerprint: responseFingerprint(raw), adapterIds } };
}

export function evaluateRewriteResponse(task: RewriteTask, raw: unknown, profile: Profile): RewriteEvaluation {
  const applied = applyRewriteResponse(task, raw);
  if (applied.status !== 'accepted' || !applied.candidate) return applied;
  const verification = task.copySpec
    ? verifyWithCopySpec(task.draft, applied.candidate, profile, task.copySpec, task.writingBrief)
    : verify(task.draft, applied.candidate, profile, task.writingBrief);
  if (!verification.passed) return { ...applied, status: 'needs_escalation', verification };
  return { ...applied, status: 'needs_semantic_review', verification };
}

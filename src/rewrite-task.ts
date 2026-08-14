import { createHash } from 'node:crypto';
import type { CopySpec, DeterministicVerificationArtifactV1, HygieneRangeOperation, Profile, RewriteApplyResult, RewriteEvaluation, RewriteFailure, RewriteLifecycleBindingV1, RewriteRangeOperation, RewriteReceipt, RewriteReplacement, RewriteResponse, RewriteResponseV2, RewriteTask, WritingBrief } from './contracts.js';
import { canonicalJson } from './canonical-json.js';
import { parseWritingBrief } from './editorial-packs.js';
import { hygieneSourceFindings } from './hygiene.js';
import { analyze, deriveEditScope, renderRewritePrompt, verifyDeterministically } from './pipeline.js';
import { sentences } from './text.js';

const MAX_RESPONSE_BYTES = 100_000;
const MAX_REPLACEMENTS = 100;
const MAX_REPLACEMENT_CHARACTERS = 10_000;

function fingerprint(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
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

function parseResponse(value: unknown): RewriteResponse | RewriteResponseV2 | { version: '1'; mode: 'SHIP'; taskFingerprint: string } | RewriteFailure {
  const raw = typeof value === 'string' ? parseJson(value) : value;
  if (isFailure(raw)) return raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return failure('invalid_response_shape', 'Response must be an object.');
  const response = raw as Record<string, unknown>;
  if (typeof response.taskFingerprint !== 'string' || response.taskFingerprint.length !== 64) return failure('invalid_response_shape', 'Response must include the task fingerprint.', 'taskFingerprint');
  if (response.mode === 'REBUILD') return failure('rebuild_response_on_edit_task', 'Rebuild responses cannot satisfy edit tasks.', 'mode');
  if (response.mode === 'SHIP' && response.version === '1') {
    return { version: '1', mode: 'SHIP', taskFingerprint: response.taskFingerprint };
  }
  if (response.version === '2') {
    if (!Array.isArray(response.operations)) return failure('invalid_response_shape', 'Version 2 responses require an operations array.', 'operations');
    if (response.operations.length > MAX_REPLACEMENTS) return failure('invalid_response_shape', `Response may include at most ${MAX_REPLACEMENTS} replacements.`, 'operations');
    for (const [index, operation] of (response.operations as RewriteRangeOperation[]).entries()) {
      if (!operation || typeof operation !== 'object' || !Number.isInteger(operation.startSentenceId) || !Number.isInteger(operation.endSentenceId) || typeof operation.text !== 'string') {
        return failure('invalid_response_shape', 'Every operation requires integer startSentenceId, endSentenceId, and string text.', `operations[${index}]`);
      }
      if (operation.endSentenceId < operation.startSentenceId) return failure('noncontiguous_range', 'A range must be inclusive and contiguous.', `operations[${index}]`);
      if (operation.text.length > MAX_REPLACEMENT_CHARACTERS) return failure('invalid_replacement_text', `Replacement text must contain at most ${MAX_REPLACEMENT_CHARACTERS} characters.`, `operations[${index}].text`);
    }
    if (response.hygieneOperations !== undefined) {
      if (!Array.isArray(response.hygieneOperations)) return failure('invalid_response_shape', 'Hygiene operations must be an array.', 'hygieneOperations');
      for (const [index, operation] of (response.hygieneOperations as HygieneRangeOperation[]).entries()) {
        if (!operation || !Number.isInteger(operation.start) || !Number.isInteger(operation.end) || typeof operation.text !== 'string' || operation.end < operation.start) {
          return failure('invalid_response_shape', 'Every hygiene operation requires integer start, end, and string text.', `hygieneOperations[${index}]`);
        }
      }
    }
    return response as unknown as RewriteResponseV2;
  }
  if (response.version !== '1') return failure('invalid_response_version', 'Response version must be "1" or "2".', 'version');
  if (!Array.isArray(response.replacements)) return failure('invalid_response_shape', 'Response replacements must be an array.', 'replacements');
  if (response.replacements.length > MAX_REPLACEMENTS) return failure('invalid_response_shape', `Response may include at most ${MAX_REPLACEMENTS} replacements.`, 'replacements');
  for (const [index, replacement] of (response.replacements as RewriteReplacement[]).entries()) {
    if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement) || !Number.isInteger(replacement.sentenceId) || typeof replacement.text !== 'string') {
      return failure('invalid_response_shape', 'Every replacement requires an integer sentenceId and string text.', `replacements[${index}]`);
    }
    if (!replacement.text.trim() || replacement.text.length > MAX_REPLACEMENT_CHARACTERS) {
      return failure('invalid_replacement_text', `Replacement text must contain at most ${MAX_REPLACEMENT_CHARACTERS} characters.`, `replacements[${index}].text`);
    }
  }
  return response as unknown as RewriteResponse;
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

export function prepareRewriteTask(draft: string, profile: Profile, copySpec?: CopySpec, writingBrief?: WritingBrief, authorizedSentenceIds: number[] = []): RewriteTask {
  const result = analyze(draft, profile, writingBrief);
  const prompt = renderRewritePrompt(draft, profile, result, [], writingBrief);
  const mapped = sentences(draft);
  const eligibleSentenceIds = new Set([...deriveEditScope(result).eligibleSentenceIds, ...authorizedSentenceIds]);
  const taskBase = {
    version: '1' as const,
    draft,
    sentences: mapped.map((sentence) => ({ id: sentence.index, text: sentence.text, eligible: eligibleSentenceIds.has(sentence.index) })),
    eligibleSentenceIds: [...eligibleSentenceIds].sort((left, right) => left - right),
    prompt,
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
  return { status: 'repairable', failures, receipt: { version: '1', taskFingerprint: task.fingerprint, responseFingerprint: responseFingerprint(raw), adapterIds, replacementSentenceIds: [] } };
}

export function applyShip(task: RewriteTask): RewriteApplyResult {
  return {
    status: 'accepted',
    candidate: task.draft,
    failures: [],
    receipt: {
      version: '1',
      taskFingerprint: task.fingerprint,
      responseFingerprint: fingerprint({ version: '1', mode: 'SHIP', taskFingerprint: task.fingerprint }),
      adapterIds: [],
      replacementSentenceIds: [],
      mode: 'SHIP',
    },
  };
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
  if ('mode' in response && response.mode === 'SHIP') {
    const shipped = applyShip(task);
    return { ...shipped, receipt: { ...shipped.receipt, adapterIds, responseFingerprint: responseFingerprint(raw) } };
  }
  if (response.version === '2') return applyRangeResponse(task, response, raw, adapterIds);
  if (!('replacements' in response)) return rejected(task, raw, [failure('invalid_response_shape', 'Response replacements must be an array.', 'replacements')], adapterIds);
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
  return { status: 'accepted', candidate, failures: [], receipt: { version: '1', taskFingerprint: task.fingerprint, responseFingerprint: responseFingerprint(raw), adapterIds, replacementSentenceIds: [...seen].sort((left, right) => left - right), mode: 'EDIT' } };
}

function applyRangeResponse(task: RewriteTask, response: RewriteResponseV2, raw: unknown, adapterIds: string[]): RewriteApplyResult {
  const sentenceMap = new Map(task.sentences.map((sentence) => [sentence.id, sentence]));
  let previousEnd = 0;
  for (const [index, operation] of response.operations.entries()) {
    if (index > 0 && operation.startSentenceId <= previousEnd) return rejected(task, raw, [failure('overlapping_range', 'Operations must be ordered and non-overlapping.', `operations[${index}]`)], adapterIds);
    if (index > 0 && operation.startSentenceId < response.operations[index - 1]!.startSentenceId) {
      return rejected(task, raw, [failure('out_of_order_range', 'Operations must be in source order.', `operations[${index}]`)], adapterIds);
    }
    previousEnd = operation.endSentenceId;
    for (let id = operation.startSentenceId; id <= operation.endSentenceId; id += 1) {
      const sentence = sentenceMap.get(id);
      if (!sentence) return rejected(task, raw, [failure('unknown_sentence_id', 'Range sentenceId is not in this task.', `operations[${index}]`)], adapterIds);
      if (!sentence.eligible) return rejected(task, raw, [failure('partly_locked_range', 'A range may cover only eligible sentences.', `operations[${index}]`)], adapterIds);
      if (id > operation.startSentenceId && !sentenceMap.has(id - 1)) return rejected(task, raw, [failure('noncontiguous_range', 'Ranges must be contiguous.', `operations[${index}]`)], adapterIds);
    }
  }
  const eligibleHygiene = new Map(hygieneSourceFindings(task.draft).filter((finding) => finding.eligible).map((finding) => [`${finding.start}:${finding.end}`, finding]));
  for (const [index, operation] of (response.hygieneOperations ?? []).entries()) {
    if (!eligibleHygiene.has(`${operation.start}:${operation.end}`)) {
      return rejected(task, raw, [failure('ineligible_hygiene_offset', 'Hygiene changes require an eligible source-offset finding.', `hygieneOperations[${index}]`)], adapterIds);
    }
  }
  let candidate = task.draft;
  for (const operation of [...(response.hygieneOperations ?? [])].sort((left, right) => right.start - left.start)) {
    candidate = `${candidate.slice(0, operation.start)}${operation.text}${candidate.slice(operation.end)}`;
  }
  const mapped = sentences(candidate);
  for (const operation of [...response.operations].reverse()) {
    const start = mapped.find((sentence) => sentence.index === operation.startSentenceId);
    const end = mapped.find((sentence) => sentence.index === operation.endSentenceId);
    if (!start || !end) return rejected(task, raw, [failure('unknown_sentence_id', 'Range sentenceId is not in this task.', 'operations')], adapterIds);
    candidate = `${candidate.slice(0, start.start)}${operation.text}${candidate.slice(end.end)}`;
  }
  return {
    status: 'accepted',
    candidate,
    failures: [],
    receipt: {
      version: '1',
      taskFingerprint: task.fingerprint,
      responseFingerprint: responseFingerprint(raw),
      adapterIds,
      operationRanges: response.operations.map((operation) => ({ startSentenceId: operation.startSentenceId, endSentenceId: operation.endSentenceId })),
      mode: 'EDIT',
    },
  };
}

export function evaluateRewriteResponse(task: RewriteTask, raw: unknown, profile: Profile): RewriteEvaluation {
  const applied = applyRewriteResponse(task, raw);
  if (applied.status !== 'accepted' || !applied.candidate) return applied;
  const { verification, artifact: deterministicArtifact } = verifyDeterministically(task.draft, applied.candidate, profile, task.copySpec, task.writingBrief);
  if (!verification.passed) return { ...applied, status: 'needs_escalation', verification };
  const lifecycleBinding = createRewriteLifecycleBinding(task, applied.receipt, deterministicArtifact);
  return { ...applied, status: 'needs_semantic_review', verification, deterministicArtifact, lifecycleBinding };
}

export function createRewriteLifecycleBinding(task: RewriteTask, receipt: RewriteReceipt, deterministic: DeterministicVerificationArtifactV1): RewriteLifecycleBindingV1 {
  if (!deterministic.passed || receipt.taskFingerprint !== task.fingerprint) throw new Error('Lifecycle binding requires a passed deterministic artifact for this rewrite task.');
  return {
    rewriteTaskFingerprint: task.fingerprint,
    rewriteResponseFingerprint: receipt.responseFingerprint,
    deterministicArtifactFingerprint: deterministic.artifactFingerprint,
    sourceHash: deterministic.sourceHash,
    candidateHash: deterministic.candidateHash,
    profileId: deterministic.profileId,
    profileRevisionDigest: deterministic.profileRevisionDigest,
    rulesetVersion: deterministic.rulesetVersion,
    schemaVersion: '1',
  };
}

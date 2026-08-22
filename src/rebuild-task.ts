import type {
  ApprovalTrustStoreV1,
  CopySpec,
  DeterministicVerificationArtifactV1,
  PreEditReduction,
  Profile,
  RebuildResponse,
  RebuildTask,
  RecompositionPolicyV1,
  RewriteApplyResult,
  RewriteEvaluation,
  RewriteFailure,
  RewriteLifecycleBindingV1,
  WritingBrief,
} from './contracts.js';
import { canonicalJson } from './canonical-json.js';
import { parseCopySpec } from './copy-spec.js';
import { parseWritingBrief } from './editorial-packs.js';
import { verifyApprovalCapability } from './approval-capability.js';
import { fingerprintPreEditReduction } from './judgment-task.js';
import { verifyRebuildDeterministically } from './pipeline.js';
import { finalOutputCheck } from './hygiene.js';
import { sentences } from './text.js';
import { HYV_VERSION } from './version.js';
import { buildRecompositionBrief, measureLexicalResidual, parseRecompositionPolicy } from './recomposition.js';
import { provenanceStatusForRebuild, writerRequestForRebuild } from './provenance-status.js';
import { fingerprint, profileIdentity, sha256 as digest } from './internal.js';

const MAX_RESPONSE_BYTES = 100_000;
const MAX_CANDIDATE_CHARACTERS = 100_000;

function failure(code: RewriteFailure['code'], message: string, path?: string): RewriteFailure {
  return { code, message, ...(path ? { path } : {}) };
}

function isFailure(value: unknown): value is RewriteFailure {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value;
}

function parseJson(value: string): unknown | RewriteFailure {
  if (Buffer.byteLength(value) > MAX_RESPONSE_BYTES) return failure('response_too_large', `Response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
  try {
    return JSON.parse(value);
  } catch {
    return failure('invalid_json', 'Response must be valid JSON.');
  }
}

function parseRebuildResponse(value: unknown): RebuildResponse | RewriteFailure {
  const raw = typeof value === 'string' ? parseJson(value) : value;
  if (isFailure(raw)) return raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return failure('invalid_response_shape', 'Response must be an object.');
  const response = raw as Record<string, unknown>;
  if ('replacements' in response || 'operations' in response) {
    return failure('edit_response_on_rebuild_task', 'Edit responses cannot satisfy rebuild tasks.');
  }
  if (response.mode === 'SHIP') return failure('edit_response_on_rebuild_task', 'Edit responses cannot satisfy rebuild tasks.', 'mode');
  if (response.version !== '1') return failure('invalid_response_version', 'Rebuild response version must be "1".', 'version');
  if (response.mode !== 'REBUILD') return failure('invalid_response_shape', 'Rebuild responses require mode REBUILD.', 'mode');
  if (typeof response.taskFingerprint !== 'string' || response.taskFingerprint.length !== 64) {
    return failure('invalid_response_shape', 'Response must include the task fingerprint.', 'taskFingerprint');
  }
  if (typeof response.candidate !== 'string') return failure('invalid_candidate_text', 'Rebuild candidate must be a string.', 'candidate');
  if (!response.candidate.trim() || response.candidate.length > MAX_CANDIDATE_CHARACTERS) {
    return failure('invalid_candidate_text', `Rebuild candidate must contain at most ${MAX_CANDIDATE_CHARACTERS} characters.`, 'candidate');
  }
  return response as unknown as RebuildResponse;
}

function renderRebuildPrompt(draft: string, copySpec: CopySpec, writingBrief?: WritingBrief, recompositionPolicy?: RecompositionPolicyV1): string {
  if (recompositionPolicy) return buildRecompositionBrief(copySpec, writingBrief);
  return [
    '# Rebuild contract',
    'Return a whole-document candidate. Do not emit sentence replacements or range operations.',
    'Keep every immutable CopySpec claim and atom. Do not add prohibited claims.',
    'Claim, polarity, hygiene, fingerprint, and semantic gates remain blocking. Lexical survival is not required.',
    '',
    '# CopySpec',
    canonicalJson({ audience: copySpec.audience, intent: copySpec.intent, channel: copySpec.channel, claims: copySpec.claims, ...(copySpec.prohibitedClaims ? { prohibitedClaims: copySpec.prohibitedClaims } : {}) }),
    ...(writingBrief ? ['', '# WritingBrief', canonicalJson(writingBrief)] : []),
    '',
    '# Draft',
    draft,
  ].join('\n');
}

function authorizationBinding(draft: string, profile: Profile, recommendationFingerprint: string): RewriteLifecycleBindingV1 {
  const identity = profileIdentity(profile);
  const sourceHash = digest(draft);
  return {
    rewriteTaskFingerprint: recommendationFingerprint,
    rewriteResponseFingerprint: recommendationFingerprint,
    deterministicArtifactFingerprint: recommendationFingerprint,
    sourceHash,
    candidateHash: sourceHash,
    profileId: identity.profileId,
    profileRevisionDigest: identity.profileRevisionDigest,
    rulesetVersion: HYV_VERSION,
    schemaVersion: '1',
  };
}

function verifyRebuildAuthorization(
  draft: string,
  profile: Profile,
  recommendationFingerprint: string,
  capability: unknown,
  trustStore: ApprovalTrustStoreV1 | unknown,
  now: number,
) {
  const authorized = verifyApprovalCapability(capability, trustStore, {
    now,
    expectedSubjectArtifactFingerprint: recommendationFingerprint,
    binding: authorizationBinding(draft, profile, recommendationFingerprint),
    expectedPurpose: 'hyv.rebuild-authorization',
  });
  if (!authorized.ok) throw new Error('Rebuild authorization is invalid.');
  return authorized;
}

export function prepareRebuildTask(
  draft: string,
  profile: Profile,
  reduction: PreEditReduction,
  copySpec: CopySpec,
  capability: unknown,
  trustStore: ApprovalTrustStoreV1 | unknown,
  now: number,
  writingBrief?: WritingBrief,
  recompositionPolicy?: RecompositionPolicyV1,
): RebuildTask {
  if (reduction.decision !== 'REBUILD') throw new Error('Rebuild requires an upstream REBUILD recommendation.');
  if (fingerprintPreEditReduction(reduction) !== reduction.recommendationFingerprint || reduction.recommendationFingerprint.length !== 64) {
    throw new Error('Rebuild requires an upstream REBUILD recommendation.');
  }
  const spec = parseCopySpec(copySpec);
  const identity = profileIdentity(profile);
  const authorized = verifyRebuildAuthorization(draft, profile, reduction.recommendationFingerprint, capability, trustStore, now);
  if (writingBrief) parseWritingBrief(writingBrief);
  if (recompositionPolicy) parseRecompositionPolicy(recompositionPolicy);
  const taskBase = {
    version: '1' as const,
    draft,
    prompt: renderRebuildPrompt(draft, spec, writingBrief, recompositionPolicy),
    copySpec: spec,
    recommendationFingerprint: reduction.recommendationFingerprint,
    authorizationFingerprint: authorized.capabilityFingerprint,
    profileId: identity.profileId,
    profileRevisionDigest: identity.profileRevisionDigest,
    ...(writingBrief ? { writingBrief } : {}),
    ...(recompositionPolicy ? { recompositionPolicy } : {}),
  };
  return { ...taskBase, fingerprint: fingerprint(taskBase) };
}

export function parseRebuildTask(value: unknown): RebuildTask {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Rebuild task must be an object.');
  const task = value as Partial<RebuildTask>;
  if (task.version !== '1' || typeof task.fingerprint !== 'string' || typeof task.draft !== 'string' || typeof task.prompt !== 'string'
    || typeof task.recommendationFingerprint !== 'string' || typeof task.authorizationFingerprint !== 'string'
    || typeof task.profileId !== 'string' || typeof task.profileRevisionDigest !== 'string' || !task.copySpec) {
    throw new Error('Rebuild task does not match version 1.');
  }
  parseCopySpec(task.copySpec);
  if (task.writingBrief !== undefined) parseWritingBrief(task.writingBrief);
  if (task.recompositionPolicy !== undefined) parseRecompositionPolicy(task.recompositionPolicy);
  const { fingerprint: suppliedFingerprint, ...base } = task;
  if (fingerprint(base) !== suppliedFingerprint) throw new Error('Rebuild task fingerprint does not match its contents.');
  return task as RebuildTask;
}

function rejected(task: RebuildTask, raw: unknown, failures: RewriteFailure[]): RewriteApplyResult {
  return {
    status: 'repairable',
    failures,
    receipt: {
      version: '1',
      taskFingerprint: task.fingerprint,
      responseFingerprint: fingerprint(raw),
      adapterIds: [],
      replacementSentenceIds: [],
      mode: 'REBUILD',
      recommendationFingerprint: task.recommendationFingerprint,
    },
  };
}

export function applyRebuildResponse(task: RebuildTask, raw: unknown): RewriteApplyResult {
  const response = parseRebuildResponse(typeof raw === 'string' ? parseJson(raw) : raw);
  if (isFailure(response)) return rejected(task, raw, [response]);
  if (response.taskFingerprint !== task.fingerprint) {
    return rejected(task, raw, [failure('task_fingerprint_mismatch', 'Response task fingerprint does not match this task.', 'taskFingerprint')]);
  }
  return {
    status: 'accepted',
    candidate: response.candidate,
    failures: [],
    receipt: {
      version: '1',
      taskFingerprint: task.fingerprint,
      responseFingerprint: fingerprint(raw),
      adapterIds: [],
      replacementSentenceIds: sentences(response.candidate).map((sentence) => sentence.index),
      mode: 'REBUILD',
      recommendationFingerprint: task.recommendationFingerprint,
    },
  };
}

export function evaluateRebuildResponse(
  task: RebuildTask,
  raw: unknown,
  profile: Profile,
  capability: unknown,
  trustStore: ApprovalTrustStoreV1 | unknown,
  now: number,
): RewriteEvaluation {
  const identity = profileIdentity(profile);
  if (identity.profileId !== task.profileId || identity.profileRevisionDigest !== task.profileRevisionDigest) {
    throw new Error('Rebuild profile binding does not match this task.');
  }
  const authorized = verifyRebuildAuthorization(task.draft, profile, task.recommendationFingerprint, capability, trustStore, now);
  if (authorized.capabilityFingerprint !== task.authorizationFingerprint) throw new Error('Rebuild authorization is invalid.');
  const applied = applyRebuildResponse(task, raw);
  if (applied.status !== 'accepted' || !applied.candidate) return applied;
  const output = finalOutputCheck(applied.candidate);
  const candidate = output.accepted ? output.output : applied.candidate;
  const checked = verifyRebuildDeterministically(task.draft, candidate, profile, task.copySpec, task.writingBrief);
  const verification = { ...checked.verification, finalOutput: output };
  const deterministicArtifact = checked.artifact;
  const receipt = {
    ...applied.receipt,
    preservationBypass: true,
    authorizationFingerprint: authorized.capabilityFingerprint,
    preservationScore: verification.preservationScore,
    ...(task.recompositionPolicy ? { lexicalResidual: measureLexicalResidual(task.draft, candidate, task.copySpec, task.recompositionPolicy) } : {}),
    provenanceStatus: provenanceStatusForRebuild(task),
  };
  if (!verification.passed) {
    const { candidate: _candidate, ...withheld } = applied;
    return { ...withheld, receipt, status: 'needs_escalation', verification, deterministicArtifact };
  }
  if (receipt.lexicalResidual && !receipt.lexicalResidual.passed) {
    const { candidate: _candidate, ...withheld } = applied;
    return {
      ...withheld,
      receipt,
      failures: [failure('lexical_residual_exceeds_policy', 'Candidate exceeds the configured lexical-residual policy.')],
      status: 'needs_escalation',
      verification,
      deterministicArtifact,
    };
  }
  const lifecycleBinding = createRebuildLifecycleBinding(task, receipt, deterministicArtifact);
  return { ...applied, candidate, receipt, status: 'needs_semantic_review', verification, deterministicArtifact, lifecycleBinding };
}

export { writerRequestForRebuild };

export function createRebuildLifecycleBinding(task: RebuildTask, receipt: RewriteApplyResult['receipt'], deterministic: DeterministicVerificationArtifactV1): RewriteLifecycleBindingV1 {
  if (!deterministic.passed || receipt.taskFingerprint !== task.fingerprint || receipt.mode !== 'REBUILD' || deterministic.verificationKind !== 'rebuild') {
    throw new Error('Lifecycle binding requires a passed rebuild artifact for this rebuild task.');
  }
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

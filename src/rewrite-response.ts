import type { DeterministicVerificationArtifactV1, RewriteFailure, RewriteLifecycleBindingV1, RewriteReceipt } from './contracts.js';

const MAX_RESPONSE_BYTES = 100_000;

export function failure(code: RewriteFailure['code'], message: string, path?: string): RewriteFailure {
  return { code, message, ...(path ? { path } : {}) };
}

export function parseResponseJson(value: string): unknown | RewriteFailure {
  if (Buffer.byteLength(value) > MAX_RESPONSE_BYTES) return failure('response_too_large', `Response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
  try {
    return JSON.parse(value);
  } catch {
    return failure('invalid_json', 'Response must be valid JSON.');
  }
}

export function projectLifecycleBinding(taskFingerprint: string, receipt: RewriteReceipt, deterministic: DeterministicVerificationArtifactV1): RewriteLifecycleBindingV1 {
  return {
    rewriteTaskFingerprint: taskFingerprint,
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

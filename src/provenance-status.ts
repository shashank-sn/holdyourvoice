import type { ProvenanceStatusV1, RebuildTask, RebuildWriterRequestV1 } from './contracts.js';
import { canonicalJson } from './canonical-json.js';
import { createHash } from 'node:crypto';

function fingerprint(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }

export function writerRequestForRebuild(task: RebuildTask): RebuildWriterRequestV1 {
  return {
    version: '1', taskFingerprint: task.fingerprint, prompt: task.prompt,
    copySpecFingerprint: fingerprint(task.copySpec),
    ...(task.recompositionPolicy ? { recompositionPolicyFingerprint: fingerprint(task.recompositionPolicy) } : {}),
  };
}

export function provenanceStatusForRebuild(task: RebuildTask): ProvenanceStatusV1 {
  return task.recompositionPolicy
    ? { version: '1', state: 'unknown', reason: 'private_or_unavailable_verifier' }
    : { version: '1', state: 'not_configured' };
}

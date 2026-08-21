import assert from 'node:assert/strict';
import test from 'node:test';
import type { RebuildTask, RecompositionPolicyV1 } from './contracts.js';
import { provenanceStatusForRebuild, writerRequestForRebuild } from './provenance-status.js';

const policy: RecompositionPolicyV1 = { version: '1', mode: 'meaning-first', lexicalResidual: { ngramSize: 5, maxSharedNgramFraction: 0.1, maxLongestSharedRunTokens: 8 }, acknowledgement: 'Measures shared wording only; does not detect or prove removal of a watermark.' };
const task: RebuildTask = {
  version: '1', fingerprint: 'a'.repeat(64), draft: 'private source phrase that must never leave the task', prompt: 'structured CopySpec-only prompt',
  copySpec: { version: '1', audience: 'operators', intent: 'explain', channel: 'email', claims: [{ id: 'one', text: 'The date is fixed.', evidence: 'calendar' }] },
  recommendationFingerprint: 'b'.repeat(64), authorizationFingerprint: 'c'.repeat(64), profileId: 'profile', profileRevisionDigest: 'd'.repeat(64), recompositionPolicy: policy,
};

test('writer request omits source, authorization, and profile body while retaining stable bindings', () => {
  const request = writerRequestForRebuild(task);
  const serialized = JSON.stringify(request);
  assert.equal(request.taskFingerprint, task.fingerprint);
  assert.match(request.prompt, /structured CopySpec-only prompt/);
  assert.doesNotMatch(serialized, /private source phrase|authorizationFingerprint|profileRevisionDigest|draft/);
  assert.match(request.copySpecFingerprint, /^[a-f0-9]{64}$/);
  assert.match(request.recompositionPolicyFingerprint ?? '', /^[a-f0-9]{64}$/);
});

test('private-provider status is unknown and ordinary rebuild has no configured verifier', () => {
  assert.deepEqual(provenanceStatusForRebuild(task), { version: '1', state: 'unknown', reason: 'private_or_unavailable_verifier' });
  assert.deepEqual(provenanceStatusForRebuild({ ...task, recompositionPolicy: undefined }), { version: '1', state: 'not_configured' });
});

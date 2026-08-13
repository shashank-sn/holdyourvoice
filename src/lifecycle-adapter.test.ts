import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import type { ApprovalCapabilityClaimsV1, ApprovalTrustStoreV1, DeterministicVerificationArtifactV1, RewriteLifecycleBindingV1 } from './contracts.js';
import { canonicalJson, canonicalJsonBytes } from './canonical-json.js';
import { finalizeLifecycle, inspectLifecycle, prepareLifecycle, submitSemanticVerdict, validateFinalApproval } from './lifecycle-adapter.js';

const deterministicBase = { version: '1' as const, verificationKind: 'standard' as const, passed: true, analysisVersion: '2', rulesetVersion: '3.2.0', preservationMetricVersion: 'legacy-set-v1' as const, preservationScore: 100, sourceHash: '4'.repeat(64), candidateHash: '5'.repeat(64), profileId: 'founder.primary', profileRevisionDigest: '6'.repeat(64), regressionKeys: [] };
const deterministicFingerprint = createHash('sha256').update(`hyv:deterministic-verification:v1\0${canonicalJson(deterministicBase)}`).digest('hex');
const deterministic: DeterministicVerificationArtifactV1 = { ...deterministicBase, artifactFingerprint: deterministicFingerprint };
const binding: RewriteLifecycleBindingV1 = { rewriteTaskFingerprint: '1'.repeat(64), rewriteResponseFingerprint: '2'.repeat(64), deterministicArtifactFingerprint: deterministicFingerprint, sourceHash: deterministic.sourceHash, candidateHash: deterministic.candidateHash, profileId: deterministic.profileId, profileRevisionDigest: deterministic.profileRevisionDigest, rulesetVersion: deterministic.rulesetVersion, schemaVersion: '1' };
const receipt = { version: '1' as const, taskFingerprint: binding.rewriteTaskFingerprint, responseFingerprint: binding.rewriteResponseFingerprint, adapterIds: [], replacementSentenceIds: [1] };
const emptyTrust: ApprovalTrustStoreV1 = { version: '1', audience: '@holdyourvoice/hyv', maxCapabilityLifetimeSeconds: 300, keys: [] };
const context = { now: 150, trustStore: emptyTrust, authorizedSemanticEvaluatorIds: { normal: ['reviewer-1'], highAssurance: [] }, authorizedHumanFinalizerIds: ['human-1'] };

test('prepares and submits a normal semantic verdict through the shared adapter', () => {
  const prepared = prepareLifecycle(deterministic, binding, receipt, 'normal', ['action_change']);
  assert.equal(prepared.task.policy, 'normal');
  assert.equal(prepared.artifact.status, 'needs_semantic_review');
  const submitted = submitSemanticVerdict(prepared.artifact, prepared.task, 'reviewer-1', { approved: true, violations: [] }, context);
  assert.equal(submitted.ok && submitted.artifact.status, 'ready_for_human_review');
  const forged = submitSemanticVerdict({ ...prepared.artifact, artifactFingerprint: '9'.repeat(64) }, prepared.task, 'reviewer-1', { approved: true, violations: [] }, context);
  assert.deepEqual(forged, { ok: false, error: 'invalid_action' });
});

test('inspection validates the artifact fingerprint and returns metadata only', () => {
  const { artifact } = prepareLifecycle(deterministic, binding, receipt, 'normal', ['action_change']);
  const inspected = inspectLifecycle(artifact);
  assert.equal(inspected.status, 'needs_semantic_review');
  assert.equal(inspected.artifactFingerprint, artifact.artifactFingerprint);
  assert.doesNotMatch(JSON.stringify(inspected), /sourceHash|candidateHash|capability|signature|nonce|verdicts/);
  assert.throws(() => inspectLifecycle({ ...artifact, artifactFingerprint: '9'.repeat(64) }), /invalid lifecycle artifact/i);
  const { artifactFingerprint: _fingerprint, ...base } = artifact;
  const malformedBase = { ...base, status: 'ready_for_human_review', parentArtifactFingerprint: artifact.artifactFingerprint };
  const malformed = { ...malformedBase, artifactFingerprint: createHash('sha256').update(`hyv:lifecycle-artifact:v1\0${canonicalJson(malformedBase)}`).digest('hex') };
  assert.throws(() => inspectLifecycle(malformed as never), /invalid lifecycle artifact/i);
  for (const invalid of [{ ...base, status: 'garbage' }, { ...base, status: 'needs_escalation', parentArtifactFingerprint: artifact.artifactFingerprint, reason: 'garbage' }]) {
    const recomputed = { ...invalid, artifactFingerprint: createHash('sha256').update(`hyv:lifecycle-artifact:v1\0${canonicalJson(invalid)}`).digest('hex') };
    assert.throws(() => inspectLifecycle(recomputed as never), /invalid lifecycle artifact/i);
  }
});

test('capability validation collapses verifier details and finalization stays reducer-backed', () => {
  const prepared = prepareLifecycle(deterministic, binding, receipt, 'normal', ['action_change']);
  const submitted = submitSemanticVerdict(prepared.artifact, prepared.task, 'reviewer-1', { approved: true, violations: [] }, context);
  assert.equal(submitted.ok, true); if (!submitted.ok) return;
  assert.deepEqual(validateFinalApproval(submitted.artifact, { payload: 'bad', signature: 'bad' }, context), { ok: false, error: 'capability_invalid' });
  const rejected = finalizeLifecycle(submitted.artifact, { evaluatorId: 'human-1', decision: 'reject' }, context);
  assert.equal(rejected.ok && rejected.artifact.status, 'needs_escalation');

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const trustStore: ApprovalTrustStoreV1 = { version: '1', audience: '@holdyourvoice/hyv', maxCapabilityLifetimeSeconds: 300, keys: [{ issuer: 'host', keyId: 'k1', publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'), status: 'active' }] };
  const claims: ApprovalCapabilityClaimsV1 = { version: '1', purpose: 'hyv.final-approval', issuer: 'host', audience: '@holdyourvoice/hyv', subjectArtifactFingerprint: submitted.artifact.artifactFingerprint, sourceHash: binding.sourceHash, candidateHash: binding.candidateHash, profileId: binding.profileId, profileRevisionDigest: binding.profileRevisionDigest, keyId: 'k1', issuedAt: 100, notBefore: 100, expiresAt: 200, nonce: 'secret-nonce' };
  const payload = canonicalJsonBytes(claims); const capability = { payload: payload.toString('base64url'), signature: sign(null, payload, privateKey).toString('base64url') };
  assert.equal(validateFinalApproval(submitted.artifact, capability, { ...context, trustStore }).ok, true);
  const approved = finalizeLifecycle(submitted.artifact, { evaluatorId: 'human-1', decision: 'approve' }, { ...context, trustStore }, capability);
  assert.equal(approved.ok && approved.artifact.status, 'approved');
  assert.doesNotMatch(JSON.stringify(approved), /secret-nonce|payload|signature/);
});

import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import type { ApprovalCapabilityClaimsV1, ApprovalCapabilityEnvelopeV1, ApprovalTrustStoreV1, RewriteLifecycleBindingV1 } from './contracts.js';
import { canonicalJsonBytes } from './canonical-json.js';
import { verifyApprovalCapability } from './approval-capability.js';

const binding: RewriteLifecycleBindingV1 = {
  rewriteTaskFingerprint: '1'.repeat(64), rewriteResponseFingerprint: '2'.repeat(64), deterministicArtifactFingerprint: '3'.repeat(64),
  sourceHash: '4'.repeat(64), candidateHash: '5'.repeat(64), profileId: 'founder.primary', profileRevisionDigest: '6'.repeat(64),
  rulesetVersion: '3.2.0', schemaVersion: '1',
};
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeySpki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
const trustStore: ApprovalTrustStoreV1 = { version: '1', audience: '@holdyourvoice/hyv', maxCapabilityLifetimeSeconds: 300, keys: [{ issuer: 'host.example', keyId: 'key-1', publicKeySpki, status: 'active' }] };

function envelope(overrides: Partial<ApprovalCapabilityClaimsV1> = {}, signer = privateKey): ApprovalCapabilityEnvelopeV1 {
  const claims: ApprovalCapabilityClaimsV1 = {
    version: '1', purpose: 'hyv.final-approval', issuer: 'host.example', audience: '@holdyourvoice/hyv',
    subjectArtifactFingerprint: '7'.repeat(64), sourceHash: binding.sourceHash, candidateHash: binding.candidateHash,
    profileId: binding.profileId, profileRevisionDigest: binding.profileRevisionDigest, keyId: 'key-1',
    issuedAt: 100, notBefore: 100, expiresAt: 200, nonce: 'nonce-1', ...overrides,
  };
  const payload = canonicalJsonBytes(claims);
  return { payload: payload.toString('base64url'), signature: sign(null, payload, signer).toString('base64url') };
}

test('verifies one canonical bound Ed25519 final-approval capability', () => {
  const result = verifyApprovalCapability(envelope(), trustStore, { now: 150, expectedSubjectArtifactFingerprint: '7'.repeat(64), binding, expectedPurpose: 'hyv.final-approval' });
  assert.equal(result.ok, true);
  if (result.ok) assert.match(result.capabilityFingerprint, /^[a-f0-9]{64}$/);
});

test('fails closed for purpose, binding, trust, time, signature, and canonical encoding', () => {
  assert.deepEqual(verifyApprovalCapability(envelope({ purpose: 'hyv.rebuild-authorization' }), trustStore, { now: 150, expectedSubjectArtifactFingerprint: '7'.repeat(64), binding, expectedPurpose: 'hyv.final-approval' }), { ok: false, error: 'wrong_purpose' });
  assert.deepEqual(verifyApprovalCapability(envelope({ candidateHash: '8'.repeat(64) }), trustStore, { now: 150, expectedSubjectArtifactFingerprint: '7'.repeat(64), binding, expectedPurpose: 'hyv.final-approval' }), { ok: false, error: 'binding_mismatch' });
  assert.deepEqual(verifyApprovalCapability(envelope(), { ...trustStore, keys: [{ ...trustStore.keys[0]!, status: 'revoked' }] }, { now: 150, expectedSubjectArtifactFingerprint: '7'.repeat(64), binding, expectedPurpose: 'hyv.final-approval' }), { ok: false, error: 'revoked_key' });
  assert.deepEqual(verifyApprovalCapability(envelope(), trustStore, { now: 201, expectedSubjectArtifactFingerprint: '7'.repeat(64), binding, expectedPurpose: 'hyv.final-approval' }), { ok: false, error: 'expired' });
  const forged = envelope(); const forgedBytes = Buffer.from(forged.signature, 'base64url'); forgedBytes[0] = forgedBytes[0]! ^ 1; forged.signature = forgedBytes.toString('base64url');
  assert.deepEqual(verifyApprovalCapability(forged, trustStore, { now: 150, expectedSubjectArtifactFingerprint: '7'.repeat(64), binding, expectedPurpose: 'hyv.final-approval' }), { ok: false, error: 'invalid_signature' });
  const nonCanonical = envelope(); nonCanonical.payload = Buffer.from(` ${Buffer.from(nonCanonical.payload, 'base64url').toString('utf8')}`).toString('base64url');
  assert.deepEqual(verifyApprovalCapability(nonCanonical, trustStore, { now: 150, expectedSubjectArtifactFingerprint: '7'.repeat(64), binding, expectedPurpose: 'hyv.final-approval' }), { ok: false, error: 'non_canonical' });
});

test('rejects malformed envelopes and invalid trust stores without returning secret material', () => {
  const result = verifyApprovalCapability({ payload: `${envelope().payload}=`, signature: envelope().signature }, trustStore, { now: 150, expectedSubjectArtifactFingerprint: '7'.repeat(64), binding, expectedPurpose: 'hyv.final-approval' });
  assert.deepEqual(result, { ok: false, error: 'invalid_encoding' });
  assert.doesNotMatch(JSON.stringify(result), /nonce-1|signature|publicKeySpki/);
  assert.deepEqual(verifyApprovalCapability(envelope(), { ...trustStore, keys: [...trustStore.keys, trustStore.keys[0]!] }, { now: 150, expectedSubjectArtifactFingerprint: '7'.repeat(64), binding, expectedPurpose: 'hyv.final-approval' }), { ok: false, error: 'invalid_schema' });
});

test('rejects an invalid host clock', () => {
  assert.deepEqual(verifyApprovalCapability(envelope(), trustStore, { now: Number.NaN, expectedSubjectArtifactFingerprint: '7'.repeat(64), binding, expectedPurpose: 'hyv.final-approval' }), { ok: false, error: 'invalid_schema' });
});

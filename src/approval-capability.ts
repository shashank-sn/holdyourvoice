import { createHash, createPublicKey, verify } from 'node:crypto';
import type { ApprovalCapabilityClaimsV1, ApprovalCapabilityPurpose, ApprovalTrustKeyV1, ApprovalTrustStoreV1, CapabilityError, RewriteLifecycleBindingV1 } from './contracts.js';
import { canonicalJsonBytes, parseCanonicalJson } from './canonical-json.js';

const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const CLAIM_KEYS = ['version', 'purpose', 'issuer', 'audience', 'subjectArtifactFingerprint', 'sourceHash', 'candidateHash', 'profileId', 'profileRevisionDigest', 'keyId', 'issuedAt', 'notBefore', 'expiresAt', 'nonce'];
const STORE_KEYS = ['version', 'audience', 'maxCapabilityLifetimeSeconds', 'keys'];

function fail(error: CapabilityError): { ok: false; error: CapabilityError } { return { ok: false, error }; }
function plain(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every((key) => key in value) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}
function bounded(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 128; }
function safeTime(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

function validClaims(value: unknown): value is ApprovalCapabilityClaimsV1 {
  if (!plain(value) || !exactKeys(value, CLAIM_KEYS)) return false;
  return bounded(value.issuer) && bounded(value.keyId) && bounded(value.profileId) && bounded(value.nonce)
    && typeof value.version === 'string' && typeof value.purpose === 'string' && typeof value.audience === 'string'
    && [value.subjectArtifactFingerprint, value.sourceHash, value.candidateHash].every((item) => typeof item === 'string' && DIGEST.test(item)) && bounded(value.profileRevisionDigest)
    && safeTime(value.issuedAt) && safeTime(value.notBefore) && safeTime(value.expiresAt);
}

export function parseApprovalTrustStore(value: unknown): ApprovalTrustStoreV1 | undefined {
  if (!plain(value) || !exactKeys(value, STORE_KEYS) || value.version !== '1' || value.audience !== '@holdyourvoice/hyv'
    || !Number.isSafeInteger(value.maxCapabilityLifetimeSeconds) || (value.maxCapabilityLifetimeSeconds as number) < 1 || (value.maxCapabilityLifetimeSeconds as number) > 86400 || !Array.isArray(value.keys) || value.keys.length > 128) return undefined;
  const pairs = new Set<string>();
  for (const item of value.keys) {
    if (!plain(item) || !exactKeys(item, ['issuer', 'keyId', 'publicKeySpki', 'status'], ['activeFrom', 'activeUntil']) || !bounded(item.issuer) || !bounded(item.keyId)
      || typeof item.publicKeySpki !== 'string' || !BASE64URL.test(item.publicKeySpki) || !['active', 'revoked'].includes(item.status as string)
      || (item.activeFrom !== undefined && !safeTime(item.activeFrom)) || (item.activeUntil !== undefined && !safeTime(item.activeUntil))) return undefined;
    const pair = `${item.issuer}\0${item.keyId}`; if (pairs.has(pair)) return undefined; pairs.add(pair);
    try {
      if (item.publicKeySpki.length > 128) return undefined;
      const der = Buffer.from(item.publicKeySpki, 'base64url');
      const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
      if (der.length !== 44 || key.asymmetricKeyType !== 'ed25519') return undefined;
    } catch { return undefined; }
  }
  return value as unknown as ApprovalTrustStoreV1;
}

export interface ApprovalVerificationExpectation {
  now: number;
  expectedSubjectArtifactFingerprint: string;
  binding: RewriteLifecycleBindingV1;
  expectedPurpose: ApprovalCapabilityPurpose;
}

export type CapabilityVerificationResult = { ok: true; capabilityFingerprint: string } | { ok: false; error: CapabilityError };

export function verifyApprovalCapability(envelope: unknown, trustValue: unknown, expected: ApprovalVerificationExpectation): CapabilityVerificationResult {
  if (!safeTime(expected.now)) return fail('invalid_schema');
  if (!plain(envelope) || !exactKeys(envelope, ['payload', 'signature']) || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string'
    || !BASE64URL.test(envelope.payload) || !BASE64URL.test(envelope.signature)) return fail('invalid_encoding');
  if (envelope.payload.length > 5462 || envelope.signature.length !== 86) return fail('size_exceeded');
  const payload = Buffer.from(envelope.payload, 'base64url'); const signature = Buffer.from(envelope.signature, 'base64url');
  if (payload.length > 4096 || signature.length !== 64) return fail('size_exceeded');
  if (payload.toString('base64url') !== envelope.payload || signature.toString('base64url') !== envelope.signature) return fail('invalid_encoding');
  let parsed: unknown;
  try { parsed = parseCanonicalJson(payload); } catch (error) { return fail(error instanceof Error && /canonical/i.test(error.message) ? 'non_canonical' : 'invalid_schema'); }
  if (!validClaims(parsed)) return fail('invalid_schema');
  const claims = parsed;
  if (claims.version !== '1') return fail('wrong_version');
  if (claims.purpose !== expected.expectedPurpose) return fail('wrong_purpose');
  if (claims.audience !== '@holdyourvoice/hyv') return fail('wrong_audience');
  if (claims.subjectArtifactFingerprint !== expected.expectedSubjectArtifactFingerprint || claims.sourceHash !== expected.binding.sourceHash || claims.candidateHash !== expected.binding.candidateHash || claims.profileId !== expected.binding.profileId || claims.profileRevisionDigest !== expected.binding.profileRevisionDigest) return fail('binding_mismatch');
  const trustStore = parseApprovalTrustStore(trustValue); if (!trustStore) return fail('invalid_schema');
  if (claims.audience !== trustStore.audience) return fail('wrong_audience');
  const key = trustStore.keys.find((item) => item.issuer === claims.issuer && item.keyId === claims.keyId) as ApprovalTrustKeyV1 | undefined;
  if (!key) return fail('unknown_key');
  if (key.status === 'revoked') return fail('revoked_key');
  if ((key.activeFrom !== undefined && (claims.issuedAt < key.activeFrom || expected.now < key.activeFrom)) || (key.activeUntil !== undefined && (claims.issuedAt >= key.activeUntil || expected.now >= key.activeUntil))) return fail('inactive_key');
  if (!(claims.issuedAt <= claims.notBefore && claims.notBefore < claims.expiresAt)) return fail('invalid_schema');
  if (claims.expiresAt - claims.issuedAt > trustStore.maxCapabilityLifetimeSeconds) return fail('lifetime_exceeded');
  if (expected.now < claims.notBefore) return fail('premature');
  if (expected.now >= claims.expiresAt) return fail('expired');
  try {
    const publicKey = createPublicKey({ key: Buffer.from(key.publicKeySpki, 'base64url'), format: 'der', type: 'spki' });
    if (!verify(null, payload, publicKey, signature)) return fail('invalid_signature');
  } catch { return fail('invalid_signature'); }
  return { ok: true, capabilityFingerprint: createHash('sha256').update('hyv:approval-capability:v1\0').update(payload).update(signature).digest('hex') };
}

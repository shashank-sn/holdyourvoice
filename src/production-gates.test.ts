import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { inspectDeliveryIntegrity, parseDeliveryIntegrityPolicy } from './delivery-integrity.js';
import { normalizeFinding, parseSurfacePolicy } from './disposition.js';
import { assessProfileReadiness } from './profile-quality.js';
import { createTeamProfileBundle, parseTeamProfileBundle } from './team-profile.js';

test('keeps delivery integrity opt-in and local', () => {
  const report = inspectDeliveryIntegrity('Hello {{name}} [missing](missing.md) [@brief]', parseDeliveryIntegrityPolicy({ version: '1', block: ['placeholder', 'local_link'], sourceIds: ['brief'] }), process.cwd());
  assert.equal(report.passed, false);
  assert.deepEqual(report.findings.map((finding) => [finding.kind, finding.disposition]), [['placeholder', 'block'], ['local_link', 'block']]);
  assert.throws(() => parseDeliveryIntegrityPolicy({ version: '2' }), /not valid/);
});

test('reports profile readiness without retaining raw samples', () => {
  const report = assessProfileReadiness(['A short sample.', 'A short sample.']);
  assert.equal(report.sampleDigests.length, 2);
  assert.ok(report.findings.some((finding) => finding.id === 'duplicate_sample'));
  assert.doesNotMatch(JSON.stringify(report), /A short sample/);
});

test('normalizes legacy findings without changing legacy fields', () => {
  assert.equal(normalizeFinding({ engine: 'ai_editor', id: 'x', severity: 'red', appliedPolicy: 'blocking', sentence: 1, excerpt: 'x', reason: 'r', suggestion: 's' }).disposition, 'block');
  assert.equal(normalizeFinding({ engine: 'ai_editor', id: 'x', severity: 'yellow', appliedPolicy: 'judgment-required', sentence: 1, excerpt: 'x', reason: 'r', suggestion: 's' }).disposition, 'review');
  assert.equal(normalizeFinding({ engine: 'voice_dna', id: 'x', severity: 'yellow', sentence: 1, excerpt: 'x', reason: 'r', suggestion: 's' }).disposition, 'signal');
  assert.equal(normalizeFinding({ engine: 'ai_editor', id: 'ai.question-hook', severity: 'yellow', appliedPolicy: 'advisory', sentence: 1, excerpt: 'x', reason: 'r', suggestion: 's' }, parseSurfacePolicy({ version: '1', overrides: { 'ai.question-hook': 'review' } })).disposition, 'review');
});

test('requires current, consent-bound team profile membership', () => {
  const fingerprint = 'a'.repeat(64);
  const keys = generateKeyPairSync('ed25519');
  const unsigned = { version: '1', id: 'team.example', createdAt: '2026-08-24T00:00:00.000Z', retention: 'delete on request', members: [{ role: 'author' as const, sourceType: 'individual-writing' as const, profileFingerprint: fingerprint, consent: { approved: true as const, basis: 'written consent', expiresAt: '2026-09-01T00:00:00.000Z' } }] };
  const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}` : JSON.stringify(value);
  const bundle = createTeamProfileBundle({ ...unsigned, authorization: { issuer: 'test', publicKeyPem: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(), signatureBase64: sign(null, Buffer.from(canonical(unsigned)), keys.privateKey).toString('base64') } });
  assert.equal(parseTeamProfileBundle(bundle, new Date('2026-08-25T00:00:00.000Z')).id, 'team.example');
  assert.throws(() => parseTeamProfileBundle({ ...bundle, id: 'tampered' }, new Date('2026-08-25T00:00:00.000Z')), /digest/);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ProfileV3 } from './contracts.js';
import { parseProfile } from './profile.js';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function profileV3(): ProfileV3 {
  const unsigned = {
    version: '3' as const,
    id: 'founder.primary',
    revision: 1,
    sampleCount: 2,
    metrics: {
      sentenceLength: 7,
      sentenceVariation: 2,
      sentenceStructure: ['i name the'],
      rhythm: 2,
      paragraphLength: 2,
      openingMoves: ['i'],
      vocabulary: ['mechanism'],
      lexicalDensity: 0.5,
      pointOfView: 'first_person' as const,
      punctuation: { '!': 0, '?': 0, ';': 0, ':': 0, '—': 0 },
      caseStyle: 'lowercase' as const,
      questionRate: 0,
      transitions: ['but'],
    },
    avoid: ['unlock'],
    provenance: { source: 'local-author-owned-samples', rights: 'author-owned', createdAt: '2026-08-13T00:00:00.000Z' },
    rulePolicy: {
      'ai.antithesis': 'advisory' as const,
      'ai.staccato': 'judgment-required' as const,
      'ai.generic': 'blocking' as const,
      'ai.question-hook': 'disabled' as const,
    },
    fingerprint: {
      contractionRate: 0.3,
      sentenceLengthDistribution: { short: 0.2, medium: 0.5, long: 0.3 },
      bulletRate: 0.1,
      enDashRate: 0.05,
    },
    tolerances: {
      contractionRate: { absolute: 0.1, calibrated: true },
      sentenceLengthDistribution: { absolute: 0.15, calibrated: false },
      bulletRate: { absolute: 0.1, calibrated: false },
      enDashRate: { absolute: 0.05, calibrated: false },
    },
    metricFixtures: {
      contractionRate: ['fixture.contractions'],
      sentenceLengthDistribution: ['fixture.sentences'],
      bulletRate: ['fixture.bullets'],
      enDashRate: ['fixture.en-dashes'],
    },
  };
  return {
    ...unsigned,
    revisionDigest: createHash('sha256').update(canonicalJson(unsigned)).digest('hex'),
  };
}

test('keeps Profile v2 parsing and runtime shape byte-for-byte compatible', () => {
  const profile = {
    version: '2', sampleCount: 2,
    metrics: {
      sentenceLength: 4, sentenceVariation: 1, sentenceStructure: [], rhythm: 1, paragraphLength: 1,
      openingMoves: [], vocabulary: [], lexicalDensity: 0.5, pointOfView: 'mixed',
      punctuation: { '!': 0, '?': 0, ';': 0, ':': 0, '—': 0 }, caseStyle: 'mixed', questionRate: 0, transitions: [],
    },
    avoid: [],
    legacyExtension: true,
  };
  assert.strictEqual(parseProfile(profile), profile);
});

test('parses a strict Profile v3 with all four rule policy states and fixture-backed metrics', () => {
  const profile = profileV3();
  assert.strictEqual(parseProfile(profile), profile);
});

test('rejects a changed Profile v3 revision digest', () => {
  const profile = profileV3();
  profile.fingerprint.bulletRate = 0.2;
  assert.throws(() => parseProfile(profile), /revision digest/);
});

test('rejects malformed Profile v3 identity, policy, provenance, and unknown keys', () => {
  for (const mutate of [
    (profile: Record<string, unknown>) => { profile.id = '../founder'; },
    (profile: Record<string, unknown>) => { profile.revision = 0; },
    (profile: Record<string, unknown>) => { (profile.rulePolicy as Record<string, unknown>)['ai.generic'] = 'warn'; },
    (profile: Record<string, unknown>) => { (profile.provenance as Record<string, unknown>).source = ''; },
    (profile: Record<string, unknown>) => { profile.extra = true; },
  ]) {
    const profile = profileV3() as unknown as Record<string, unknown>;
    mutate(profile);
    assert.throws(() => parseProfile(profile), /version 3 profile/);
  }
});

test('rejects unbounded or invalid Profile v3 metrics and tolerances', () => {
  for (const mutate of [
    (profile: ProfileV3) => { profile.fingerprint.contractionRate = Number.NaN; },
    (profile: ProfileV3) => { profile.fingerprint.sentenceLengthDistribution = { short: 0.2, medium: 0.2, long: 0.2 }; },
    (profile: ProfileV3) => { profile.tolerances.bulletRate.absolute = 1.1; },
    (profile: ProfileV3) => { (profile.tolerances.enDashRate as unknown as Record<string, unknown>).calibrated = 'yes'; },
    (profile: ProfileV3) => { profile.metricFixtures.enDashRate = []; },
    (profile: ProfileV3) => { profile.metricFixtures.bulletRate = Array.from({ length: 65 }, (_, index) => `fixture.${index}`); },
  ]) {
    const profile = profileV3();
    mutate(profile);
    assert.throws(() => parseProfile(profile), /version 3 profile/);
  }
});

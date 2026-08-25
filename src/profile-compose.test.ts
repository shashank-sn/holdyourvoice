import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalJson } from './canonical-json.js';
import type { ProfileV3 } from './contracts.js';
import { composeProfiles, parseProfileRatio } from './profile-compose.js';
import { parseProfile } from './profile.js';

function profile(id: string, channel: 'email' | 'docs', sentenceLength: number, policy: ProfileV3['rulePolicy']): ProfileV3 {
  const unsigned = {
    version: '3' as const, id, revision: 1, sampleCount: 3,
    metrics: { sentenceLength, sentenceVariation: 2, sentenceStructure: ['i name the'], rhythm: 2, paragraphLength: 2, openingMoves: ['i'], vocabulary: ['mechanism'], lexicalDensity: 0.5, pointOfView: 'first_person' as const, punctuation: { '!': 0, '?': 0, ';': 0, ':': 0, '—': 0 }, caseStyle: 'lowercase' as const, questionRate: 0, transitions: ['but'] },
    avoid: [id], provenance: { source: 'test', rights: 'test', createdAt: '2026-08-13T00:00:00.000Z' }, rulePolicy: policy, channel,
    tone: { formality: 0.4, confidence: 0.6, warmth: 0.7, energy: 0.3, complexity: 0.5 },
    fingerprint: { contractionRate: 0.2, sentenceLengthDistribution: { short: 0.3, medium: 0.5, long: 0.2 }, bulletRate: 0.1, enDashRate: 0 },
    tolerances: { contractionRate: { absolute: 0.1, calibrated: true }, sentenceLengthDistribution: { absolute: 0.1, calibrated: true }, bulletRate: { absolute: 0.1, calibrated: true }, enDashRate: { absolute: 0.1, calibrated: true } },
    metricFixtures: { contractionRate: ['fixture.a'], sentenceLengthDistribution: ['fixture.b'], bulletRate: ['fixture.c'], enDashRate: ['fixture.d'] },
  };
  return { ...unsigned, revisionDigest: createHash('sha256').update(canonicalJson(unsigned)).digest('hex') };
}

test('composes metrics by ratio and intersects policy conservatively', () => {
  const email = profile('founder.email', 'email', 10, { 'ai.leverage': 'advisory' });
  const docs = profile('founder.docs', 'docs', 20, { 'ai.leverage': 'blocking' });
  const composed = composeProfiles([email, docs], parseProfileRatio('70:30', 2));
  assert.equal(composed.metrics.sentenceLength, 13);
  assert.equal(composed.rulePolicy['ai.leverage'], 'blocking');
  assert.deepEqual([...composed.avoid].sort(), ['founder.docs', 'founder.email']);
  assert.equal(composed.channel, 'email');
  assert.strictEqual(parseProfile(composed), composed);
});

test('rejects malformed profile ratios', () => {
  assert.throws(() => parseProfileRatio('70:0', 2), /positive/);
  assert.throws(() => parseProfileRatio('70:30:10', 2), /contain 2/);
});

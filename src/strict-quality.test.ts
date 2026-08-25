import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ProfileV3 } from './contracts.js';
import { evaluateStrictQuality } from './strict-quality.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

function profile(): ProfileV3 {
  const unsigned = {
    version: '3' as const, id: 'strict.author', revision: 1, sampleCount: 5,
    metrics: { sentenceLength: 6, sentenceVariation: 2, sentenceStructure: [], rhythm: 1, paragraphLength: 1, openingMoves: [], vocabulary: [], lexicalDensity: 0.5, pointOfView: 'mixed' as const, punctuation: { '!': 0, '?': 0, ';': 0, ':': 0, '—': 0 }, caseStyle: 'standard' as const, questionRate: 0, transitions: [] },
    avoid: [], provenance: { source: 'local', rights: 'author-owned', createdAt: '2026-08-25T00:00:00.000Z' }, rulePolicy: {},
    fingerprint: { contractionRate: 0, sentenceLengthDistribution: { short: 1, medium: 0, long: 0 }, bulletRate: 0, enDashRate: 0 },
    tolerances: { contractionRate: { absolute: 1, calibrated: true }, sentenceLengthDistribution: { absolute: 1, calibrated: true }, bulletRate: { absolute: 1, calibrated: true }, enDashRate: { absolute: 1, calibrated: true } },
    metricFixtures: { contractionRate: ['fixture.a'], sentenceLengthDistribution: ['fixture.b'], bulletRate: ['fixture.c'], enDashRate: ['fixture.d'] },
  };
  return { ...unsigned, revisionDigest: createHash('sha256').update(canonical(unsigned)).digest('hex') };
}

function samples() { return Array.from({ length: 5 }, (_, index) => Array.from({ length: 100 }, () => `sample${index} records one concrete detail.`).join(' ')); }

test('returns strict-ready only for a calibrated, adequately sampled, clean v3 profile', () => {
  const report = evaluateStrictQuality('The launch starts Tuesday. The owner signed the checklist.', profile(), samples());
  assert.equal(report.disposition, 'strict-ready');
  assert.deepEqual(report.findings, []);
});

test('blocks an underpowered or uncalibrated voice profile before trusting voice matching', () => {
  const underpowered = evaluateStrictQuality('The launch starts Tuesday.', profile(), samples().slice(0, 2));
  assert.equal(underpowered.disposition, 'blocked');
  assert.ok(underpowered.findings.some((item) => item.id === 'strict.profile.sample-count'));

  const sparse = evaluateStrictQuality('The launch starts Tuesday.', profile(), Array.from({ length: 5 }, (_, index) => `sample ${index}.`));
  assert.ok(sparse.findings.some((item) => item.id === 'strict.profile.sample-coverage'));

  const uncalibrated = profile();
  uncalibrated.tolerances.bulletRate.calibrated = false;
  const report = evaluateStrictQuality('The launch starts Tuesday.', uncalibrated, samples());
  assert.ok(report.findings.some((item) => item.id === 'strict.profile.uncalibrated.bulletRate'));
});

test('requires human review for a judgment-required AI pattern and blocks a configured one', () => {
  const review = evaluateStrictQuality('We leverage the existing checklist.', profile(), samples());
  assert.equal(review.disposition, 'needs-human-review');
  assert.ok(review.findings.some((item) => item.id === 'strict.ai_editor.ai.leverage' && item.disposition === 'review'));

  const blockedProfile = profile();
  blockedProfile.rulePolicy['ai.leverage'] = 'blocking';
  const blocked = evaluateStrictQuality('We leverage the existing checklist.', blockedProfile, samples());
  assert.equal(blocked.disposition, 'blocked');
  assert.ok(blocked.findings.some((item) => item.id === 'strict.ai_editor.ai.leverage' && item.disposition === 'block'));
});

test('blocks unresolved final-output hygiene', () => {
  const report = evaluateStrictQuality('The launch starts\u200b Tuesday.', profile(), samples());
  assert.equal(report.disposition, 'blocked');
  assert.ok(report.findings.some((item) => item.id === 'strict.final-output'));
});

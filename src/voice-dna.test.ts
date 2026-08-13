import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProfileV3 } from './contracts.js';
import { analyzeVoiceDna, buildProfile, measureFounderFingerprint } from './voice-dna.js';

function profileV3(overrides: Partial<ProfileV3['fingerprint']> = {}): ProfileV3 {
  const base = buildProfile(['i write plainly. i name the work.', 'i keep the mechanism clear. i avoid filler.']);
  return {
    ...base,
    version: '3',
    id: 'founder.test',
    revision: 1,
    revisionDigest: '0'.repeat(64),
    provenance: { source: 'test', rights: 'test', createdAt: '2026-08-13T00:00:00.000Z' },
    rulePolicy: {},
    fingerprint: {
      contractionRate: 0,
      sentenceLengthDistribution: { short: 1, medium: 0, long: 0 },
      bulletRate: 0,
      enDashRate: 0,
      ...overrides,
    },
    tolerances: {
      contractionRate: { absolute: 0.05, calibrated: true },
      sentenceLengthDistribution: { absolute: 0.05, calibrated: false },
      bulletRate: { absolute: 0.05, calibrated: false },
      enDashRate: { absolute: 0.05, calibrated: false },
    },
    metricFixtures: {
      contractionRate: ['test'], sentenceLengthDistribution: ['test'], bulletRate: ['test'], enDashRate: ['test'],
    },
  };
}

test('requires two local samples before creating a profile', () => {
  assert.throws(() => buildProfile(['One sample is not enough.']), /at least two local writing samples/);
});

test('requires every local sample to contain writing', () => {
  assert.throws(() => buildProfile(['', '   ']), /must contain writing/);
});

test('reports local avoid-list matches as red sentence findings', () => {
  const profile = buildProfile(['i write plainly. i name the work.', 'i keep the mechanism clear. i avoid filler.'], ['unlock']);
  const report = analyzeVoiceDna('i unlock the answer. i name the work.', profile);
  assert.deepEqual(report.findings.filter((finding) => finding.id === 'dna.avoid-list').map((finding) => [finding.severity, finding.sentence]), [['red', 1]]);
  assert.equal(report.passed, false);
});

test('keeps a case-style mismatch as a yellow review cue', () => {
  const profile = buildProfile(['i write plainly. i name the work.', 'i keep the mechanism clear. i avoid filler.']);
  const report = analyzeVoiceDna('This sentence starts in standard case.', profile);
  assert.ok(report.findings.some((finding) => finding.id === 'dna.case-style' && finding.severity === 'yellow'));
  assert.equal(report.passed, true);
});

test('keeps the documented VoiceDNA review checks as yellow findings', () => {
  const profile = buildProfile([
    'i write short sentences. i ask no questions. i name the mechanism.',
    'i keep the language plain. i explain the work. i use first person.',
  ]);
  const report = analyzeVoiceDna('You explain a much longer sentence with several extra words so the reader can follow the full mechanism in detail. Do you agree?', profile);
  for (const id of ['dna.sentence-length', 'dna.question-rate', 'dna.point-of-view']) {
    assert.ok(report.findings.some((finding) => finding.id === id && finding.severity === 'yellow'), id);
  }
  assert.equal(report.passed, true);
});

test('keeps buildProfile and v2 analysis output exactly on version 2', () => {
  const profile = buildProfile(['i write plainly.', 'i name the work.']);
  assert.equal(profile.version, '2');
  assert.deepEqual(Object.keys(profile), ['version', 'sampleCount', 'metrics', 'avoid']);
  assert.equal(analyzeVoiceDna('i write plainly.', profile).version, '2');
});

test('measures contractions in both directions and accepts curly apostrophes', () => {
  assert.equal(measureFounderFingerprint("I can't stop because I won't stop.").contractionRate, 2 / 7);
  assert.equal(measureFounderFingerprint('I cannot stop because I will not stop.').contractionRate, 0);
  assert.equal(measureFounderFingerprint("I can’t stop.").contractionRate, 1 / 3);
});

test('measures sentence buckets, bullets, and en dashes with stable denominators', () => {
  const text = '- One short line.\n- This medium sentence contains exactly nine ordinary words right now.\nThis final sentence has more than twenty words so it lands in the long distribution bucket without relying on punctuation tricks or hidden tokens – done.';
  const metrics = measureFounderFingerprint(text);
  assert.deepEqual(metrics.sentenceLengthDistribution, { short: 1 / 3, medium: 1 / 3, long: 1 / 3 });
  assert.equal(metrics.bulletRate, 2 / 3);
  assert.equal(metrics.enDashRate, 1 / 38);
});

test('returns zeroed deterministic metrics for empty and tiny inputs', () => {
  assert.deepEqual(measureFounderFingerprint(''), {
    contractionRate: 0,
    sentenceLengthDistribution: { short: 0, medium: 0, long: 0 },
    bulletRate: 0,
    enDashRate: 0,
  });
  assert.equal(measureFounderFingerprint('–').enDashRate, 1);
});

test('reports v3 contraction drift in both directions without failing', () => {
  const highTarget = analyzeVoiceDna('I cannot stop because I will not stop.', profileV3({ contractionRate: 0.5 }));
  const lowTarget = analyzeVoiceDna("I can't stop because I won't stop.", profileV3());
  for (const report of [highTarget, lowTarget]) {
    assert.ok(report.findings.some((item) => item.id === 'dna.fingerprint.contraction-rate' && item.severity === 'yellow'));
    assert.equal(report.passed, true);
  }
});

test('reports all v3 fingerprint drift in deterministic report-only order', () => {
  const profile = profileV3({
    sentenceLengthDistribution: { short: 0, medium: 1, long: 0 },
    bulletRate: 1,
    enDashRate: 0.5,
  });
  const report = analyzeVoiceDna('One short sentence.', profile);
  assert.deepEqual(report.findings.filter((item) => item.id.startsWith('dna.fingerprint.')).map((item) => item.id), [
    'dna.fingerprint.sentence-length-distribution',
    'dna.fingerprint.bullet-rate',
    'dna.fingerprint.en-dash-rate',
  ]);
  assert.ok(report.findings.filter((item) => item.id.startsWith('dna.fingerprint.')).every((item) => item.severity === 'yellow'));
  assert.equal(report.passed, true);
});

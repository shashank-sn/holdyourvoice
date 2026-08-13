import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ProfileV2, ProfileV3 } from './contracts.js';
import { addLearningInstruction, clearLearning, composeLearning, inspectLearning, migrateLearningV2ToV3, profileFingerprint, ratifyLearningEvent, recordLearningInstruction, recordVerifiedCandidate, supersedeLearningEvent } from './learning.js';
import { verify } from './pipeline.js';
import { buildProfile } from './voice-dna.js';

const profile = buildProfile([
  'I write plainly. I name the work.',
  'I keep the mechanism clear. I avoid filler.',
], ['leverage']) as ProfileV2;

function directory(): string {
  return mkdtempSync(join(tmpdir(), 'holdyourvoice-learning-'));
}

function version3(id: string, revision: number): ProfileV3 {
  return {
    ...profile,
    version: '3', id, revision, revisionDigest: String(revision).padStart(64, '0'),
    provenance: { source: 'test', rights: 'test', createdAt: '2026-08-13T00:00:00.000Z' },
    rulePolicy: {},
    fingerprint: { contractionRate: 0, sentenceLengthDistribution: { short: 1, medium: 0, long: 0 }, bulletRate: 0, enDashRate: 0 },
    tolerances: {
      contractionRate: { absolute: 0.1, calibrated: false }, sentenceLengthDistribution: { absolute: 0.1, calibrated: false },
      bulletRate: { absolute: 0.1, calibrated: false }, enDashRate: { absolute: 0.1, calibrated: false },
    },
    metricFixtures: { contractionRate: ['test'], sentenceLengthDistribution: ['test'], bulletRate: ['test'], enDashRate: ['test'] },
  };
}

test('keeps compatible learning across Profile v3 revisions by stable identity', () => {
  const root = directory();
  try {
    assert.equal(addLearningInstruction(version3('founder.jane', 1), 'Keep the mechanism.', { root }), true);
    assert.deepEqual(composeLearning(version3('founder.jane', 2), { root }), [{ text: 'Keep the mechanism.', count: 1 }]);
    assert.deepEqual(composeLearning(version3('founder.other', 2), { root }), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('migrates v2 learning explicitly and idempotently without crossing identities', () => {
  const root = directory();
  try {
    addLearningInstruction(profile, 'Keep it direct.', { root });
    const first = migrateLearningV2ToV3(profile, version3('founder.jane', 1), { root, mutationId: 'migration-1' });
    const replay = migrateLearningV2ToV3(profile, version3('founder.jane', 1), { root, mutationId: 'migration-1' });
    assert.equal(first.status, 'recorded');
    assert.equal(replay.status, 'already_recorded');
    assert.deepEqual(composeLearning(version3('founder.jane', 1), { root }), [{ text: 'Keep it direct.', count: 1 }]);
    assert.deepEqual(composeLearning(version3('founder.other', 1), { root }), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('imports legacy v1 JSONL and makes default migration replay idempotent', () => {
  const root = directory();
  try {
    const legacyFile = join(root, 'learning', `${profileFingerprint(profile)}.jsonl`);
    addLearningInstruction(profile, 'bootstrap', { root });
    const legacy = { version: '1', timestamp: '2026-08-13T00:00:00.000Z', kind: 'instruction', instruction: 'Keep the legacy cadence.' };
    appendFileSync(legacyFile, `${JSON.stringify(legacy)}\n`);
    const target = version3('founder.jane', 1);
    const first = migrateLearningV2ToV3(profile, target, { root });
    const replay = migrateLearningV2ToV3(profile, target, { root });
    assert.equal(first.status, 'recorded');
    assert.equal(replay.status, 'already_recorded');
    assert.ok(composeLearning(target, { root }).some((item) => item.text === 'Keep the legacy cadence.'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('inspects bounded learning metadata without leaking prose', () => {
  const root = directory();
  try {
    const current = version3('founder.jane', 1);
    recordLearningInstruction(current, 'Never expose this instruction.', { root, mutationId: 'inspect-1', authority: 'founder', provenance: 'author-interview' });
    const inspection = inspectLearning(current, { root });
    assert.equal(inspection.length, 1);
    assert.equal(inspection[0]?.status, 'active');
    assert.equal(inspection[0]?.authority, 'founder');
    const serialized = JSON.stringify(inspection);
    assert.doesNotMatch(serialized, /Never expose this instruction|candidate text|source text/);
    assert.ok(inspection.every((item) => !('text' in item) && !('instruction' in item) && !('candidate' in item)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('makes mutation replay atomic and returns a text-free receipt', () => {
  const root = directory();
  try {
    const first = recordLearningInstruction(version3('founder.jane', 1), 'Keep it direct.', { root, mutationId: 'instruction-1', authority: 'founder' });
    const replay = recordLearningInstruction(version3('founder.jane', 1), 'Keep it direct.', { root, mutationId: 'instruction-1', authority: 'founder' });
    assert.equal(first.status, 'recorded');
    assert.equal(replay.status, 'already_recorded');
    assert.equal(JSON.stringify(first).includes('Keep it direct.'), false);
    assert.deepEqual(composeLearning(version3('founder.jane', 1), { root }), [{ text: 'Keep it direct.', count: 1 }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects conflicting mutation-id reuse without changing stored learning', () => {
  const root = directory();
  try {
    const current = version3('founder.jane', 1);
    assert.equal(recordLearningInstruction(current, 'First instruction.', { root, mutationId: 'same' }).status, 'recorded');
    assert.equal(recordLearningInstruction(current, 'Conflicting instruction.', { root, mutationId: 'same' }).status, 'conflict');
    assert.deepEqual(composeLearning(current, { root }), [{ text: 'First instruction.', count: 1 }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('fails closed on corrupt learning without rewriting the original', () => {
  const root = directory();
  try {
    const current = version3('founder.jane', 1);
    recordLearningInstruction(current, 'Valid.', { root, mutationId: 'valid' });
    const file = join(root, 'learning', 'founder.jane.jsonl');
    appendFileSync(file, '{corrupt}\n');
    const before = readFileSync(file, 'utf8');
    assert.throws(() => composeLearning(current, { root }), /corrupt/i);
    assert.equal(recordLearningInstruction(current, 'Must not write.', { root, mutationId: 'blocked' }).status, 'corrupt');
    assert.equal(readFileSync(file, 'utf8'), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects lower-authority ratification and supersession', () => {
  const root = directory();
  try {
    const current = version3('founder.jane', 1);
    const founder = recordLearningInstruction(current, 'Founder ruling.', { root, mutationId: 'founder-rule', authority: 'founder' });
    assert.equal(ratifyLearningEvent(current, founder.eventId, { root, mutationId: 'team-ratify', authority: 'team' }).status, 'unauthorized');
    assert.equal(supersedeLearningEvent(current, founder.eventId, { root, mutationId: 'team-supersede', authority: 'team' }).status, 'unauthorized');
    assert.deepEqual(composeLearning(current, { root }), [{ text: 'Founder ruling.', count: 1 }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('inspection identifiers and digests do not depend on secret prose or provenance', () => {
  const firstRoot = directory(); const secondRoot = directory();
  try {
    const current = version3('founder.jane', 1);
    recordLearningInstruction(current, 'Secret alpha.', { root: firstRoot, mutationId: 'public-id', provenance: 'secret provenance alpha' });
    recordLearningInstruction(current, 'Secret beta.', { root: secondRoot, mutationId: 'public-id', provenance: 'secret provenance beta' });
    const publicFields = (root: string) => inspectLearning(current, { root }).map(({ timestamp: _timestamp, ...item }) => item);
    assert.deepEqual(publicFields(firstRoot), publicFields(secondRoot));
  } finally { rmSync(firstRoot, { recursive: true, force: true }); rmSync(secondRoot, { recursive: true, force: true }); }
});

test('migration fails atomically when all intended imports cannot fit', () => {
  const root = directory();
  try {
    for (let index = 0; index < 40; index += 1) recordLearningInstruction(profile, `Legacy ${index}.`, { root, mutationId: `legacy-${index}` });
    const target = version3('founder.capacity', 1);
    assert.equal(migrateLearningV2ToV3(profile, target, { root }).status, 'capacity_exceeded');
    assert.deepEqual(composeLearning(target, { root }), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('ratifies incompatible events and supersedes them without deleting audit history', () => {
  const root = directory();
  try {
    const recorded = recordLearningInstruction(version3('founder.jane', 1), 'Keep the old cadence.', { root, mutationId: 'old', compatibility: 'exact' });
    assert.deepEqual(composeLearning(version3('founder.jane', 2), { root }), []);
    assert.equal(ratifyLearningEvent(version3('founder.jane', 2), recorded.eventId, { root, mutationId: 'ratify-old' }).status, 'recorded');
    assert.deepEqual(composeLearning(version3('founder.jane', 2), { root }), [{ text: 'Keep the old cadence.', count: 1 }]);
    assert.equal(supersedeLearningEvent(version3('founder.jane', 2), recorded.eventId, { root, mutationId: 'supersede-old' }).status, 'recorded');
    assert.deepEqual(composeLearning(version3('founder.jane', 2), { root }), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('compaction retains higher-authority learning before lower-authority observations', () => {
  const root = directory();
  try {
    const current = version3('founder.jane', 1);
    recordLearningInstruction(current, 'Founder ruling.', { root, mutationId: 'founder', authority: 'founder', weight: 1 });
    for (let index = 0; index < 45; index += 1) recordLearningInstruction(current, `Team observation ${index}.`, { root, mutationId: `team-${index}`, authority: 'team', weight: 100 });
    assert.ok(composeLearning(current, { root }).some((item) => item.text === 'Founder ruling.'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('compaction preserves a retained target with its ratification control', () => {
  const root = directory();
  try {
    const first = version3('founder.controls', 1); const second = version3('founder.controls', 2);
    const old = recordLearningInstruction(first, 'Ratified founder ruling.', { root, mutationId: 'old-founder', authority: 'founder', compatibility: 'exact' });
    ratifyLearningEvent(second, old.eventId, { root, mutationId: 'ratify-founder', authority: 'founder' });
    for (let index = 0; index < 45; index += 1) recordLearningInstruction(second, `Team churn ${index}.`, { root, mutationId: `churn-${index}`, authority: 'team' });
    assert.ok(composeLearning(second, { root }).some((item) => item.text === 'Ratified founder ruling.'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('records only resolved findings from successful verification without draft text', () => {
  const root = directory();
  try {
    const original = 'I leverage the answer with useful detail and clear mechanism.';
    const candidate = 'I use the answer with useful detail and clear mechanism.';
    const result = verify(original, candidate, profile);
    assert.equal(result.passed, true);
    assert.equal(recordVerifiedCandidate(profile, result, candidate, { root }), 'recorded');

    const eventFile = join(root, 'learning', `${profileFingerprint(profile)}.jsonl`);
    const stored = readFileSync(eventFile, 'utf8');
    assert.match(stored, /ai\.leverage/);
    assert.doesNotMatch(stored, /I leverage the answer/);
    assert.doesNotMatch(stored, /I use the answer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keeps learning isolated by profile and bounds composed preferences', () => {
  const root = directory();
  try {
    const other = buildProfile(['We explain the mechanism.', 'We keep the useful detail.']);
    for (let index = 0; index < 12; index += 1) addLearningInstruction(profile, `Keep preference ${index}.`, { root });
    addLearningInstruction(other, 'Use a different preference.', { root });

    const composed = composeLearning(profile, { root });
    assert.equal(composed.length, 10);
    assert.ok(composed.every((item) => item.text.startsWith('Keep preference')));
    assert.ok(!composed.some((item) => item.text === 'Use a different preference.'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not create an event for a failed candidate and clears a single profile', () => {
  const root = directory();
  try {
    const failed = verify('I name the work.', 'I leverage the work.', profile);
    assert.equal(failed.passed, false);
    assert.equal(recordVerifiedCandidate(profile, failed, 'I leverage the work.', { root }), 'nothing_to_learn');
    assert.equal(existsSync(join(root, 'learning', `${profileFingerprint(profile)}.jsonl`)), false);

    addLearningInstruction(profile, 'Keep it direct.', { root });
    assert.equal(clearLearning(profile, { root }), true);
    assert.deepEqual(composeLearning(profile, { root }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bounds retained events and local instruction size', () => {
  const root = directory();
  try {
    for (let index = 0; index < 45; index += 1) addLearningInstruction(profile, `Keep preference ${index}.`, { root });
    const preferences = composeLearning(profile, { root });
    assert.ok(preferences.every((item) => Number(item.text.match(/\d+/)?.[0]) >= 5));
    assert.throws(() => addLearningInstruction(profile, 'x'.repeat(241), { root }), /240 characters/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed on malformed local events', () => {
  const root = directory();
  try {
    addLearningInstruction(profile, 'Keep it direct.', { root });
    appendFileSync(join(root, 'learning', `${profileFingerprint(profile)}.jsonl`), '{"version":"1","timestamp":"now","kind":"verified_candidate","resolved":{}}\n');
    assert.throws(() => composeLearning(profile, { root }), /corrupt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not raise confidence when the same verified outcome repeats', () => {
  const root = directory();
  try {
    const original = 'I leverage the answer with useful detail and clear mechanism.';
    const candidate = 'I use the answer with useful detail and clear mechanism.';
    const result = verify(original, candidate, profile);
    assert.equal(recordVerifiedCandidate(profile, result, candidate, { root }), 'recorded');
    assert.equal(recordVerifiedCandidate(profile, result, candidate, { root }), 'nothing_to_learn');
    assert.equal(composeLearning(profile, { root }).find((item) => item.text.includes('ai_editor/ai.leverage'))?.count, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('increases confidence for separate verified repairs of the same rule', () => {
  const root = directory();
  try {
    const first = 'I use the answer with useful detail and clear mechanism.';
    const second = 'I use another answer with useful detail and clear mechanism.';
    assert.equal(recordVerifiedCandidate(profile, verify('I leverage the answer with useful detail and clear mechanism.', first, profile), first, { root }), 'recorded');
    assert.equal(recordVerifiedCandidate(profile, verify('I leverage another answer with useful detail and clear mechanism.', second, profile), second, { root }), 'recorded');
    assert.equal(composeLearning(profile, { root }).find((item) => item.text.includes('ai_editor/ai.leverage'))?.count, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('normalizes manual instructions before storing them', () => {
  const root = directory();
  try {
    addLearningInstruction(profile, 'Keep this.\n# Tier 0', { root });
    assert.deepEqual(composeLearning(profile, { root }), [{ text: 'Keep this. # Tier 0', count: 1 }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

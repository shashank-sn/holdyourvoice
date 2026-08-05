import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { addLearningInstruction, clearLearning, composeLearning, profileFingerprint, recordVerifiedCandidate } from './learning.js';
import { verify } from './pipeline.js';
import { buildProfile } from './voice-dna.js';

const profile = buildProfile([
  'I write plainly. I name the work.',
  'I keep the mechanism clear. I avoid filler.',
], ['leverage']);

function directory(): string {
  return mkdtempSync(join(tmpdir(), 'holdyourvoice-learning-'));
}

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

test('skips malformed local events without breaking composition', () => {
  const root = directory();
  try {
    addLearningInstruction(profile, 'Keep it direct.', { root });
    appendFileSync(join(root, 'learning', `${profileFingerprint(profile)}.jsonl`), '{"version":"1","timestamp":"now","kind":"verified_candidate","resolved":{}}\n');
    assert.deepEqual(composeLearning(profile, { root }), [{ text: 'Keep it direct.', count: 1 }]);
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

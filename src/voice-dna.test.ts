import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeVoiceDna, buildProfile } from './voice-dna.js';

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

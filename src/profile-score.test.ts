import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProfile } from './voice-dna.js';
import { scoreHeldoutProfile } from './profile-score.js';

const samples = [
  'I write a direct note about the launch. The owner checks the evidence before we ship. The next step is clear and the work stays small.',
  'I name the trade-off before I make the decision. We keep the mechanism visible for the person doing the work. The release has one owner.',
  'I start from the evidence in the issue. Then I explain the constraint and choose a concrete next step. The team can check the result.',
];

test('scores held-out writing against the writer range without calling it authorship', () => {
  const profile = buildProfile(samples);
  const report = scoreHeldoutProfile('I name the evidence, explain the trade-off, and choose the next step. The owner can check the work before release.', profile, samples);
  assert.equal(report.disposition, 'inside_band');
  assert.equal(report.selfSimilarity?.ceiling, 100);
  assert.equal(report.selfSimilarity?.samplePairs, 3);
  assert.equal(Object.keys(report.components ?? {}).length, 13);
});

test('abstains for insufficient held-out writing and language confidence', () => {
  const profile = buildProfile(samples);
  assert.equal(scoreHeldoutProfile(samples[0]!, profile, samples.slice(0, 2)).disposition, 'abstain');
  assert.equal(scoreHeldoutProfile('これは十分な日本語の文章ですが、現在の英語メトリクスでは評価しません。', profile, samples).disposition, 'abstain');
});

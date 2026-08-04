import assert from 'node:assert/strict';
import test from 'node:test';
import { analyze, rewritePrompt, verify } from './pipeline.js';
import { buildProfile } from './voice-dna.js';

const profile = buildProfile([
  'I ship clear ideas. The details stay concrete. I explain the mechanism without fuss.',
  'I write short sentences. Then I explain the mechanism. My work stays plain and specific.',
], ['leverage']);

test('keeps the two engine scores independent', () => {
  const result = analyze('Firstly, we leverage a holistic strategy.', profile);
  assert.equal(result.aiEditor.passed, false);
  assert.equal(typeof result.voiceDna.score, 'number');
});

test('builds all thirteen VoiceDNA measurements', () => {
  assert.deepEqual(Object.keys(profile.metrics), ['sentenceLength', 'sentenceVariation', 'sentenceStructure', 'rhythm', 'paragraphLength', 'openingMoves', 'vocabulary', 'lexicalDensity', 'pointOfView', 'punctuation', 'caseStyle', 'questionRate', 'transitions']);
});

test('orders rewrite instructions by importance tier', () => {
  const prompt = rewritePrompt('Firstly, we leverage a holistic strategy.', profile);
  assert.ok(prompt.indexOf('# Tier 0') < prompt.indexOf('# Tier 1'));
  assert.ok(prompt.indexOf('# Tier 1') < prompt.indexOf('# Tier 2'));
  assert.ok(prompt.indexOf('# Tier 2') < prompt.indexOf('# Tier 3'));
  assert.ok(prompt.indexOf('# Tier 3') < prompt.indexOf('# Tier 4'));
});

test('post gate reports a new AI regression', () => {
  const result = verify('I ship clear ideas.', 'I ship clear ideas — a game-changer.', profile);
  assert.equal(result.passed, false);
  assert.ok(result.regressions.length > 0);
  assert.equal(result.original.aiEditor.passed, true);
  assert.equal(result.candidate.aiEditor.passed, false);
});

test('puts all thirteen VoiceDNA elements in the rewrite brief', () => {
  const prompt = rewritePrompt('I ship clear ideas.', profile);
  for (const element of ['Sentence length', 'sentence variation', 'sentence structure', 'rhythm', 'Paragraph length', 'lexical density', 'point of view', 'punctuation', 'case style', 'question rate', 'Openings', 'Vocabulary', 'Transitions']) {
    assert.match(prompt, new RegExp(element));
  }
});

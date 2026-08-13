import assert from 'node:assert/strict';
import test from 'node:test';
import { rules } from './ai-editor-rules.js';

function rule(id: string) {
  const match = rules.find((candidate) => candidate.id === id);
  assert.ok(match, `missing rule ${id}`);
  return match;
}

test('struct.not-x-y only detects an explicit two-beat contrast', () => {
  const matcher = rule('struct.not-x-y').expression;
  assert.equal(matcher.test('Not speed. Reliability.'), true);
  assert.equal(matcher.test('This does not include the standard onboarding steps every team runs.'), false);
});

test('keeps the explicit this-isnt reframe matcher available to policy', () => {
  const matcher = rule('struct.this-isnt-x-this-is-y').expression;
  assert.equal(matcher.test("This isn't positioning. This is proof."), true);
  assert.equal(matcher.test('This positioning claim has proof.'), false);
});

test('treats both long dash characters as red findings', () => {
  const emDash = rule('punct.em-dash');
  const enDash = rule('punct.en-dash');
  assert.equal(emDash.severity, 'red');
  assert.equal(enDash.severity, 'red');
  assert.equal(emDash.expression.test('The job failed — retry it.'), true);
  assert.equal(enDash.expression.test('Use pages 6–11.'), true);
  assert.equal(emDash.expression.test('The job failed; retry it.'), false);
  assert.equal(enDash.expression.test('Use pages 6-11.'), false);
});

test('detects clear performative-sincerity phrases as red', () => {
  const matcher = rule('formula.performative-sincerity');
  assert.equal(matcher.severity, 'red');
  for (const text of ['To be honest, the launch failed.', 'In all honesty, the launch failed.']) {
    assert.equal(matcher.expression.test(text), true, text);
  }
  assert.equal(matcher.expression.test('The honest report says the launch failed.'), false);
});

test('detects performative-sincerity adverbs as yellow', () => {
  const matcher = rule('hedge.performative-sincerity-adverb');
  assert.equal(matcher.severity, 'yellow');
  for (const text of [
    'Honestly, the launch failed.',
    'Genuinely, the launch failed.',
    'Truly, the launch failed.',
    'Frankly, the launch failed.',
    'Actually, the launch failed.',
  ]) {
    assert.equal(matcher.expression.test(text), true, text);
  }
  assert.equal(matcher.expression.test('The genuine invoice arrived.'), false);
});

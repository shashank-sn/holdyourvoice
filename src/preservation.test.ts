import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePreservation, legacySetPreservation, orderedTokenPreservation } from './preservation.js';

test('reports separately versioned legacy and ordered-token preservation values', () => {
  const report = comparePreservation('alpha bravo alpha charlie', 'alpha charlie bravo');
  assert.deepEqual(report, {
    legacySet: { version: 'legacy-set-v1', score: 100 },
    orderedToken: { version: 'ordered-token-sequence-v1', wordSurvival: 0.5, lengthRatio: 0.75 },
  });
});

test('ports donor token normalization and ordered matching without changing the legacy arithmetic', () => {
  assert.equal(orderedTokenPreservation("Ship, DON'T stop.", "don't ship stop").wordSurvival, 0.667);
  assert.equal(legacySetPreservation('tiny plus durable signal', 'durable signal').score, 100);
});

test('defines empty-input denominators explicitly', () => {
  assert.deepEqual(orderedTokenPreservation('', ''), { version: 'ordered-token-sequence-v1', wordSurvival: 0, lengthRatio: 0 });
  assert.deepEqual(legacySetPreservation('', 'new text'), { version: 'legacy-set-v1', score: 100 });
});

test('matches the donor metric three-decimal half-even rounding', () => {
  const original = Array.from({ length: 16 }, (_, index) => `token${index}`).join(' ');
  assert.equal(orderedTokenPreservation(original, 'token0').wordSurvival, 0.062);
});

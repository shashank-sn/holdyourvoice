import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveRuleAllowances } from './rule-allowances.js';

test('derives only non-verbatim punctuation allowances from repeated sample evidence', () => {
  const allowances = deriveRuleAllowances([
    'I write this way — with a deliberate turn.',
    'The point is direct — then I explain it.',
    'A plain sample has no allowance.',
  ]);
  assert.deepEqual(Object.keys(allowances), ['punct.em-dash']);
  assert.equal(allowances['punct.em-dash'].sampleCount, 2);
  assert.match(allowances['punct.em-dash'].evidenceDigest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(allowances).includes('deliberate turn'), false);
});

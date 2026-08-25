import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveRuleAllowances } from './rule-allowances.js';

test('derives only non-verbatim style allowances from repeated sample evidence', () => {
  const allowances = deriveRuleAllowances([
    'I write this way — with a deliberate turn.',
    'The point is direct — then I explain it.',
    'The note says “ship Tuesday” after the check.',
    'The runbook repeats “ship Tuesday” as a decision.',
    'A plain sample has no allowance.',
  ]);
  assert.deepEqual(Object.keys(allowances), ['punct.em-dash', 'format.curly-quotes']);
  assert.equal(allowances['punct.em-dash'].sampleCount, 2);
  assert.match(allowances['punct.em-dash'].evidenceDigest, /^[a-f0-9]{64}$/);
  assert.equal(allowances['format.curly-quotes'].sampleCount, 2);
  assert.equal(JSON.stringify(allowances).includes('deliberate turn'), false);
});

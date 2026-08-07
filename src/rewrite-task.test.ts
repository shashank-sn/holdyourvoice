import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRewriteResponse, prepareRewriteTask } from './rewrite-task.js';
import { buildProfile } from './voice-dna.js';

const profile = buildProfile([
  'I write clear notes. I keep the mechanism visible.',
  'I name the trade-off. Then I make the next step plain.',
], ['leverage']);

test('applies only eligible numbered replacements and preserves all clean bytes', () => {
  const task = prepareRewriteTask('I leverage the answer. The launch is on 14 August.', profile);
  const result = applyRewriteResponse(task, {
    version: '1',
    taskFingerprint: task.fingerprint,
    replacements: [{ sentenceId: 1, text: 'I use the answer.' }],
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.candidate, 'I use the answer. The launch is on 14 August.');
  assert.deepEqual(result.receipt.adapterIds, []);
});

test('rejects a duplicate, unknown, or clean sentence replacement before it creates a candidate', () => {
  const task = prepareRewriteTask('I leverage the answer. The launch is on 14 August.', profile);
  const duplicate = applyRewriteResponse(task, JSON.stringify({
    version: '1', taskFingerprint: task.fingerprint,
    replacements: [{ sentenceId: 1, text: 'I use the answer.' }, { sentenceId: 1, text: 'I choose the answer.' }],
  }));
  assert.equal(duplicate.status, 'repairable');
  assert.equal(duplicate.candidate, undefined);
  assert.equal(duplicate.failures[0]?.code, 'duplicate_sentence_id');

  const unknown = applyRewriteResponse(task, {
    version: '1', taskFingerprint: task.fingerprint,
    replacements: [{ sentenceId: 99, text: 'I use the answer.' }],
  });
  assert.equal(unknown.status, 'repairable');
  assert.equal(unknown.failures[0]?.code, 'unknown_sentence_id');
});

test('repairs only a stringified replacement list after initial schema rejection', () => {
  const task = prepareRewriteTask('I leverage the answer.', profile);
  const result = applyRewriteResponse(task, JSON.stringify({
    version: '1', taskFingerprint: task.fingerprint,
    replacements: JSON.stringify([{ sentenceId: 1, text: 'I use the answer.' }]),
  }));
  assert.equal(result.status, 'accepted');
  assert.equal(result.candidate, 'I use the answer.');
  assert.deepEqual(result.receipt.adapterIds, ['stringified_replacements_v1']);
});

test('keeps a valid response byte-for-byte unchanged by repair adapters', () => {
  const task = prepareRewriteTask('I leverage the answer.', profile);
  const response = JSON.stringify({ version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 1, text: 'I use the answer.' }] });
  const result = applyRewriteResponse(task, response);
  assert.equal(result.status, 'accepted');
  assert.equal(result.receipt.responseFingerprint.length, 64);
  assert.deepEqual(result.receipt.adapterIds, []);
});

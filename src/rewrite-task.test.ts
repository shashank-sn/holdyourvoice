import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyRewriteResponse, parseRewriteTask, prepareRewriteTask } from './rewrite-task.js';
import { parseWritingBrief } from './editorial-packs.js';
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

test('carries WritingBrief context into a fingerprinted rewrite task', () => {
  const brief = parseWritingBrief({ version: '1', audience: 'founders', intent: 'start a discussion', format: 'social' });
  const task = prepareRewriteTask('A pattern I keep seeing in founder posts is vague advice.', profile, undefined, brief);
  assert.equal(task.writingBrief?.format, 'social');
  assert.ok(task.eligibleSentenceIds.includes(1));
});

test('rejects a fingerprint-valid rewrite task with malformed WritingBrief data', () => {
  const task = prepareRewriteTask('I leverage the answer.', profile);
  const { fingerprint: _fingerprint, ...taskBase } = task;
  const base = { ...taskBase, writingBrief: { version: '1', audience: 'operators', intent: 'write', format: 'general', prohibitedTerms: [42] } };
  const malformed = { ...base, fingerprint: createHash('sha256').update(JSON.stringify(base)).digest('hex') };
  assert.throws(() => parseRewriteTask(malformed), /WritingBrief/);
});

test('rejects a fingerprint-valid rewrite task with a null WritingBrief', () => {
  const task = prepareRewriteTask('I leverage the answer.', profile);
  const { fingerprint: _fingerprint, ...taskBase } = task;
  const base = { ...taskBase, writingBrief: null };
  const malformed = { ...base, fingerprint: createHash('sha256').update(JSON.stringify(base)).digest('hex') };
  assert.throws(() => parseRewriteTask(malformed), /WritingBrief/);
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

test('repairs only an exact outer JSON code fence after JSON parsing fails', () => {
  const task = prepareRewriteTask('I leverage the answer with useful detail and clear mechanism.', profile);
  const response = `\`\`\`json\n${JSON.stringify({ version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 1, text: 'I use the answer with useful detail and clear mechanism.' }] })}\n\`\`\``;
  const result = applyRewriteResponse(task, response);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.receipt.adapterIds, ['fenced_json_v1']);
});

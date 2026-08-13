import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyRewriteResponse, createRewriteLifecycleBinding, evaluateRewriteResponse, parseRewriteTask, prepareRewriteTask } from './rewrite-task.js';
import { parseWritingBrief } from './editorial-packs.js';
import { canonicalJson } from './canonical-json.js';
import { verifyDeterministically } from './pipeline.js';
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

test('does not make an advisory broad catalog match eligible', () => {
  const task = prepareRewriteTask('I write clear notes. This work is meaningful. I keep the mechanism visible.', profile);
  assert.deepEqual(task.eligibleSentenceIds, []);
  assert.deepEqual(task.sentences.map((sentence) => sentence.eligible), [false, false, false]);
});

test('grants edit scope only to blocking findings and keeps pending judgment separate', () => {
  const advisory = prepareRewriteTask('Firstly, check the invoice.', profile);
  assert.deepEqual(advisory.eligibleSentenceIds, []);
  const neutralProfile = buildProfile(['I write plainly.', 'I name the mechanism.']);
  const pending = prepareRewriteTask('We leverage the scheduler.', neutralProfile);
  assert.deepEqual(pending.eligibleSentenceIds, []);
  assert.match(pending.prompt, /pending judgment/i);
  const blocking = prepareRewriteTask('The scheduler failed — twice. The owner checked it.', profile);
  assert.deepEqual(blocking.eligibleSentenceIds, [1]);
});

test('keeps blocking VoiceDNA avoid findings eligible', () => {
  const task = prepareRewriteTask('The plan uses leverage.', profile);
  assert.deepEqual(task.eligibleSentenceIds, [1]);
});

test('preserves founder reframes that reconciled policy makes advisory', () => {
  const task = prepareRewriteTask("This isn't positioning. This is proof.", profile);
  assert.deepEqual(task.eligibleSentenceIds, []);
});

test('preserves a clean draft byte-for-byte when the rewrite response is empty', () => {
  const draft = 'I write clear notes.\n\nI keep the mechanism visible.\n';
  const task = prepareRewriteTask(draft, profile);
  assert.deepEqual(task.eligibleSentenceIds, []);
  const result = applyRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [] });
  assert.equal(result.status, 'accepted');
  assert.equal(result.candidate, draft);
});

test('rejects an attempted edit to a clean sentence without changing any source bytes', () => {
  const draft = 'I leverage the answer.\n\nThe launch starts Tuesday.\n';
  const task = prepareRewriteTask(draft, profile);
  const result = applyRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 2, text: 'The launch starts Wednesday.' }] });
  assert.equal(result.status, 'repairable');
  assert.equal(result.candidate, undefined);
  assert.equal(result.failures[0]?.code, 'ineligible_sentence_id');
  assert.equal(task.draft, draft);
});

test('carries WritingBrief context into a fingerprinted rewrite task', () => {
  const brief = parseWritingBrief({ version: '1', audience: 'founders', intent: 'start a discussion', format: 'social' });
  const task = prepareRewriteTask('A pattern I keep seeing in founder posts is vague advice.', profile, undefined, brief);
  assert.equal(task.writingBrief?.format, 'social');
  assert.deepEqual(task.eligibleSentenceIds, []);
});

test('rejects a fingerprint-valid rewrite task with malformed WritingBrief data', () => {
  const task = prepareRewriteTask('I leverage the answer.', profile);
  const { fingerprint: _fingerprint, ...taskBase } = task;
  const base = { ...taskBase, writingBrief: { version: '1', audience: 'operators', intent: 'write', format: 'general', prohibitedTerms: [42] } };
  const malformed = { ...base, fingerprint: createHash('sha256').update(canonicalJson(base)).digest('hex') };
  assert.throws(() => parseRewriteTask(malformed), /WritingBrief/);
});

test('rejects a fingerprint-valid rewrite task with a null WritingBrief', () => {
  const task = prepareRewriteTask('I leverage the answer.', profile);
  const { fingerprint: _fingerprint, ...taskBase } = task;
  const base = { ...taskBase, writingBrief: null };
  const malformed = { ...base, fingerprint: createHash('sha256').update(canonicalJson(base)).digest('hex') };
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
  assert.deepEqual(result.receipt.replacementSentenceIds, [1]);
});

test('binds the task, response, deterministic artifact, text hashes, and profile revision', () => {
  const draft = 'I write clear notes.';
  const task = prepareRewriteTask(draft, profile);
  const applied = applyRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [] });
  assert.equal(applied.status, 'accepted');
  const artifact = verifyDeterministically(draft, applied.candidate!, profile).artifact;
  const binding = createRewriteLifecycleBinding(task, applied.receipt, artifact);
  assert.equal(binding.rewriteTaskFingerprint, task.fingerprint);
  assert.equal(binding.rewriteResponseFingerprint, applied.receipt.responseFingerprint);
  assert.equal(binding.deterministicArtifactFingerprint, artifact.artifactFingerprint);
  assert.match(binding.sourceHash, /^[a-f0-9]{64}$/);
});

test('returns the deterministic artifact and lifecycle binding at the semantic gate', () => {
  const task = prepareRewriteTask('I write clear notes.', profile);
  const result = evaluateRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [] }, profile);
  assert.equal(result.status, 'needs_semantic_review');
  assert.equal(result.deterministicArtifact?.passed, true);
  assert.equal(result.lifecycleBinding?.deterministicArtifactFingerprint, result.deterministicArtifact?.artifactFingerprint);
});

test('keeps object response fingerprints stable across property order', () => {
  const task = prepareRewriteTask('I leverage the answer.', profile);
  const first = applyRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 1, text: 'I use the answer.' }] });
  const second = applyRewriteResponse(task, { replacements: [{ text: 'I use the answer.', sentenceId: 1 }], taskFingerprint: task.fingerprint, version: '1' });
  assert.equal(first.receipt.responseFingerprint, second.receipt.responseFingerprint);
});

test('repairs only an exact outer JSON code fence after JSON parsing fails', () => {
  const task = prepareRewriteTask('I leverage the answer with useful detail and clear mechanism.', profile);
  const response = `\`\`\`json\n${JSON.stringify({ version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 1, text: 'I use the answer with useful detail and clear mechanism.' }] })}\n\`\`\``;
  const result = applyRewriteResponse(task, response);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.receipt.adapterIds, ['fenced_json_v1']);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { lintFacts } from './fact-linter.js';
import { parseWritingBrief } from './editorial-packs.js';
import { applyRewriteResponse, evaluateRewriteResponse, prepareRewriteTask } from './rewrite-task.js';
import { buildProfile } from './voice-dna.js';

const profile = buildProfile(['I write short notes. I explain each change.', 'I check the source. I keep the detail.']);
const source = 'The trial lasted 18 days. The team kept the notes.';
const brief = parseWritingBrief({ version: '1', audience: 'operators', intent: 'report the trial', format: 'general', factSources: [{ id: 'trial', text: source }] });

test('acceptance: ordinary capitalization and discourse closers do not invent factual errors', () => {
  for (const draft of ['The team kept the notes.', "That's it.", 'That’s it.']) {
    const report = lintFacts({ sources: brief.factSources!, draft });
    assert.equal(report.findings.filter((finding) => finding.severity === 'error').length, 0, draft);
  }
});

test('acceptance: concrete source conflicts remain errors across fact categories', () => {
  for (const [evidence, draft] of [
    ['The trial lasted 18 days.', 'The trial lasted 81 days.'],
    ['Nora Reed leads the trial.', 'Nora Reid leads the trial.'],
    ['Beacon exports CSV files.', 'Beacon exports PDF files.'],
    ['Beacon supports CSV exports.', 'Beacon does not support CSV exports.'],
  ]) {
    const report = lintFacts({ sources: [{ id: 'source', text: evidence }], draft });
    assert.ok(report.findings.some((finding) => finding.severity === 'error'), draft);
  }
});

test('acceptance: uncertain semantic correspondence asks for review without inventing a contradiction', () => {
  const report = lintFacts({ sources: [{ id: 'trial', text: 'The trial reduced time spent preparing agendas.' }], draft: 'Planning became easier for participants.' });
  assert.ok(report.findings.some((finding) => finding.severity === 'needs_human_review'));
  assert.equal(report.findings.some((finding) => finding.severity === 'error'), false);
});

test('acceptance: confirmed factual repairs unlock only the affected sentence', () => {
  const task = prepareRewriteTask('The trial lasted 81 days.\n\nThe team kept the notes.\n', profile, undefined, brief);
  assert.deepEqual(task.eligibleSentenceIds, [1]);
  const fixed = applyRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 1, text: 'The trial lasted 18 days.' }] });
  assert.equal(fixed.status, 'accepted');
  assert.equal(fixed.candidate, `${source.replace(' The team', '\n\nThe team')}\n`);
  const changedSoundSentence = applyRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 2, text: 'The team discarded the notes.' }] });
  assert.equal(changedSoundSentence.candidate, undefined);
  assert.ok(changedSoundSentence.failures.some((failure) => failure.code === 'ineligible_sentence_id'));
});

test('acceptance: an ambiguous claim does not authorize rewriting', () => {
  const task = prepareRewriteTask('Planning became easier for participants.', profile, undefined, brief);
  assert.deepEqual(task.eligibleSentenceIds, []);
});

test('acceptance: a nearby number with a different meaning does not establish a correction', () => {
  const costBrief = parseWritingBrief({ ...brief, factSources: [{ id: 'cost', text: 'The trial cost 18 dollars.' }] });
  const task = prepareRewriteTask('The trial saved 81 dollars.', profile, undefined, costBrief);
  assert.deepEqual(task.eligibleSentenceIds, []);
  const result = evaluateRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [] }, profile);
  assert.equal(result.status, 'needs_semantic_review');
  assert.ok(result.verification?.factLint?.findings.some((finding) => finding.severity === 'needs_human_review'));
});

test('acceptance: a corrected fact must still complete semantic review', () => {
  const task = prepareRewriteTask('The trial lasted 81 days. The team kept the notes.', profile, undefined, brief);
  const result = evaluateRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 1, text: 'The trial lasted 18 days.' }] }, profile);
  assert.notEqual(result.status, 'accepted');
  assert.equal(result.status, 'needs_semantic_review');
  assert.ok(result.lifecycleBinding);
});

test('acceptance: an unresolved in-scope fact returns actionable repair feedback', () => {
  const task = prepareRewriteTask('The trial lasted 81 days. The team kept the notes.', profile, undefined, brief);
  const result = evaluateRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [] }, profile);
  assert.equal(result.status, 'needs_escalation');
  assert.equal(result.feedback?.disposition, 'repair_in_scope');
  const blocker = result.feedback?.blockers.find((item) => item.gate === 'facts');
  assert.equal(blocker?.disposition, 'repair_in_scope');
  assert.deepEqual(blocker?.sentenceIds, [1]);
  assert.ok(blocker?.reason.trim());
  assert.equal(result.lifecycleBinding, undefined);
});

test('acceptance: a missing required fact outside sentence scope stops automatic repair', () => {
  const requiredBrief = parseWritingBrief({ ...brief, requiredFacts: [{ id: 'notes', text: 'The team kept the notes.' }] });
  const task = prepareRewriteTask('The trial lasted 81 days.', profile, undefined, requiredBrief);
  const result = evaluateRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 1, text: 'The trial lasted 18 days.' }] }, profile);
  assert.equal(result.status, 'needs_escalation');
  assert.equal(result.feedback?.disposition, 'review_required');
  assert.ok(result.feedback?.blockers.some((blocker) => blocker.gate === 'required_facts' && blocker.disposition === 'review_required'));
  assert.equal(result.lifecycleBinding, undefined);
});

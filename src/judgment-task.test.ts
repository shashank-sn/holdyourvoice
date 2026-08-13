import assert from 'node:assert/strict';
import test from 'node:test';
import { bindJudgmentEnvelope, preparePostCandidateJudgment, preparePreEditJudgment, reducePostCandidate, reducePreEdit } from './judgment-task.js';
import { applyRewriteResponse, applyShip, prepareRewriteTask } from './rewrite-task.js';
import { hygieneSourceFindings } from './hygiene.js';
import { buildProfile } from './voice-dna.js';

const profile = buildProfile([
  'I write clear notes. I keep the mechanism visible.',
  'I name the trade-off. Then I make the next step plain.',
], ['leverage']);

function envelope(task: ReturnType<typeof preparePreEditJudgment>, decision: 'SHIP' | 'EDIT' | 'REBUILD', extra: Record<string, unknown> = {}) {
  return {
    version: '1' as const,
    stage: task.stage,
    judgmentType: task.judgmentType,
    taskFingerprint: task.taskFingerprint,
    bindings: { ...task.bindings, evaluatorId: 'writer.1' },
    findings: [],
    decision,
    ...extra,
  };
}

test('pre-edit findings select SHIP, bounded EDIT, or REBUILD', () => {
  const draft = 'I leverage the answer. The launch is on 14 August.';
  const triage = preparePreEditJudgment(draft, profile, 'triage');
  const argument = preparePreEditJudgment(draft, profile, 'argument');
  const form = preparePreEditJudgment(draft, profile, 'form');
  const ship = reducePreEdit([
    bindJudgmentEnvelope(triage, envelope(triage, 'SHIP')),
    bindJudgmentEnvelope(argument, envelope(argument, 'SHIP')),
    bindJudgmentEnvelope(form, envelope(form, 'SHIP')),
  ]);
  assert.equal(ship.decision, 'SHIP');
  const edit = reducePreEdit([
    bindJudgmentEnvelope(triage, envelope(triage, 'EDIT', { editScope: { ranges: [{ startSentenceId: 1, endSentenceId: 1 }] } })),
    bindJudgmentEnvelope(argument, envelope(argument, 'SHIP')),
    bindJudgmentEnvelope(form, envelope(form, 'SHIP')),
  ]);
  assert.equal(edit.decision, 'EDIT');
  assert.deepEqual(edit.editScope.ranges, [{ startSentenceId: 1, endSentenceId: 1 }]);
  const rebuild = reducePreEdit([
    bindJudgmentEnvelope(triage, envelope(triage, 'SHIP')),
    bindJudgmentEnvelope(argument, envelope(argument, 'REBUILD')),
    bindJudgmentEnvelope(form, envelope(form, 'SHIP')),
  ]);
  assert.equal(rebuild.decision, 'REBUILD');
});

test('unbounded argument failure can recommend only rebuild', () => {
  const draft = 'I leverage the answer. The launch is on 14 August.';
  const triage = preparePreEditJudgment(draft, profile, 'triage');
  const argument = preparePreEditJudgment(draft, profile, 'argument');
  const form = preparePreEditJudgment(draft, profile, 'form');
  const reduced = reducePreEdit([
    bindJudgmentEnvelope(triage, envelope(triage, 'EDIT', { editScope: { ranges: [{ startSentenceId: 1, endSentenceId: 1 }] } })),
    bindJudgmentEnvelope(argument, envelope(argument, 'EDIT', { findings: [{ kind: 'argument', unbounded: true }] })),
    bindJudgmentEnvelope(form, envelope(form, 'SHIP')),
  ]);
  assert.equal(reduced.decision, 'REBUILD');
  assert.equal(reduced.reason, 'unbounded_argument_failure');
});

test('paragraph-level findings cannot unlock text without named ranges', () => {
  const draft = 'I leverage the answer. The launch is on 14 August.';
  const triage = preparePreEditJudgment(draft, profile, 'triage');
  const argument = preparePreEditJudgment(draft, profile, 'argument');
  const form = preparePreEditJudgment(draft, profile, 'form');
  assert.throws(() => reducePreEdit([
    bindJudgmentEnvelope(triage, envelope(triage, 'EDIT')),
    bindJudgmentEnvelope(argument, envelope(argument, 'SHIP')),
    bindJudgmentEnvelope(form, envelope(form, 'SHIP')),
  ]), /contiguous sentence ranges/);
});

test('deleting one eligible sentence or merging two adjacent sentences succeeds', () => {
  const draft = 'I leverage the answer. I leverage the second point. The launch is on 14 August.';
  const task = prepareRewriteTask(draft, profile, undefined, undefined, [1, 2]);
  const deleted = applyRewriteResponse(task, {
    version: '2',
    taskFingerprint: task.fingerprint,
    operations: [{ startSentenceId: 1, endSentenceId: 1, text: '' }],
  });
  assert.equal(deleted.status, 'accepted');
  assert.equal(deleted.candidate, ' I leverage the second point. The launch is on 14 August.');
  const merged = applyRewriteResponse(task, {
    version: '2',
    taskFingerprint: task.fingerprint,
    operations: [{ startSentenceId: 1, endSentenceId: 2, text: 'I use both points.' }],
  });
  assert.equal(merged.status, 'accepted');
  assert.equal(merged.candidate, 'I use both points. The launch is on 14 August.');
});

test('overlapping, noncontiguous, out-of-order, or partly locked ranges fail before candidate construction', () => {
  const draft = 'I leverage the answer. The launch is on 14 August. I keep the mechanism visible.';
  const task = prepareRewriteTask(draft, profile);
  const overlap = applyRewriteResponse(task, {
    version: '2',
    taskFingerprint: task.fingerprint,
    operations: [
      { startSentenceId: 1, endSentenceId: 1, text: 'I use the answer.' },
      { startSentenceId: 1, endSentenceId: 1, text: 'I choose the answer.' },
    ],
  });
  assert.equal(overlap.status, 'repairable');
  assert.equal(overlap.candidate, undefined);
  assert.equal(overlap.failures[0]?.code, 'overlapping_range');
  const locked = applyRewriteResponse(task, {
    version: '2',
    taskFingerprint: task.fingerprint,
    operations: [{ startSentenceId: 1, endSentenceId: 2, text: 'I use the answer. The launch is on 14 August.' }],
  });
  assert.equal(locked.status, 'repairable');
  assert.equal(locked.failures[0]?.code, 'partly_locked_range');
});

test('SHIP returns original bytes without a model response body', () => {
  const draft = 'I leverage the answer. The launch is on 14 August.';
  const task = prepareRewriteTask(draft, profile);
  const shipped = applyShip(task);
  assert.equal(shipped.status, 'accepted');
  assert.equal(shipped.candidate, draft);
  assert.equal(shipped.receipt.mode, 'SHIP');
  const viaResponse = applyRewriteResponse(task, { version: '1', mode: 'SHIP', taskFingerprint: task.fingerprint });
  assert.equal(viaResponse.candidate, draft);
});

test('hygiene changes occur only through eligible source-offset findings', () => {
  const draft = `\uFEFFI leverage the answer.`;
  const findings = hygieneSourceFindings(draft);
  assert.equal(findings[0]?.eligible, true);
  const task = prepareRewriteTask(draft, profile);
  const rejected = applyRewriteResponse(task, {
    version: '2',
    taskFingerprint: task.fingerprint,
    operations: [],
    hygieneOperations: [{ start: 1, end: 2, text: '' }],
  });
  assert.equal(rejected.status, 'repairable');
  assert.equal(rejected.failures[0]?.code, 'ineligible_hygiene_offset');
  const cleaned = applyRewriteResponse(task, {
    version: '2',
    taskFingerprint: task.fingerprint,
    operations: [{ startSentenceId: 1, endSentenceId: 1, text: 'I use the answer.' }],
    hygieneOperations: [{ start: findings[0]!.start, end: findings[0]!.end, text: '' }],
  });
  assert.equal(cleaned.status, 'accepted');
  assert.equal(cleaned.candidate, 'I use the answer.');
});

test('post-candidate reduction requires the full judgment set', () => {
  const draft = 'I write clear notes.';
  const candidate = 'I write clear notes.';
  const kinds = ['argument', 'polarity', 'form', 'flatness', 'semantic'] as const;
  const envelopes = kinds.map((kind) => {
    const task = preparePostCandidateJudgment(draft, candidate, profile, kind);
    return bindJudgmentEnvelope(task, {
      version: '1',
      stage: 'post-candidate',
      judgmentType: kind,
      taskFingerprint: task.taskFingerprint,
      bindings: { ...task.bindings, evaluatorId: 'writer.1' },
      findings: [],
      decision: 'CLEAR',
    });
  });
  assert.equal(reducePostCandidate(envelopes).decision, 'CLEAR');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareRewriteTask } from './rewrite-task.js';
import { buildProfile } from './voice-dna.js';
import type { WritingBrief } from './contracts.js';

// Synthetic queue and trial facts authored for these regression tests.
const profile = buildProfile(['The queue held twelve jobs.', 'The worker checked the queue.']);
const brief = (...texts: string[]): WritingBrief => ({ version: '1', audience: 'operators', intent: 'report', format: 'social', factSources: texts.map((text, id) => ({ id: `source-${id}`, text })) });

test('fact repair includes source evidence and the same eligible IDs as the task', () => {
  const task = prepareRewriteTask('The queue held 18 jobs. The worker checked the queue.', profile, undefined, brief('The queue held 12 jobs. The worker checked the queue.'));
  assert.deepEqual(task.factRepair?.eligibleSentenceIds, [1]);
  assert.match(task.prompt, /Eligible sentence IDs: 1\./);
  assert.match(task.prompt, /\[number_drift; repair authorized\]/);
  assert.match(task.prompt, /source-0.*The queue held 12 jobs/);
  assert.match(task.prompt, /Preserve every sentence outside the eligible sentence IDs exactly/);
});

test('conflicting source values do not grant fact edit permission', () => {
  const task = prepareRewriteTask('The queue held 18 jobs.', profile, undefined, brief('The queue held 12 jobs.', 'The queue held 14 jobs.'));
  assert.deepEqual(task.factRepair?.eligibleSentenceIds, []);
  assert.match(task.prompt, /review only; no added edit permission/);
});

test('number overlap with a different predicate does not authorize a repair', () => {
  const task = prepareRewriteTask('The trial saved 81 dollars.', profile, undefined, brief('The trial cost 18 dollars.'));
  assert.deepEqual(task.factRepair?.eligibleSentenceIds, []);
});

test('exact date and quote mismatch frames can be repaired without widening scope', () => {
  for (const [draft, source] of [
    ['The trial began on 12 January 2025.', 'The trial began on 14 January 2025.'],
    ['Mara said "the queue is empty".', 'Mara said "the queue is full".'],
  ]) {
    const task = prepareRewriteTask(draft, profile, undefined, brief(source));
    assert.deepEqual(task.factRepair?.eligibleSentenceIds, [1]);
  }
});

test('entity and capability findings remain review-only without precise repair support', () => {
  for (const [draft, source] of [
    ['Nora approved the queue.', 'Mara approved the queue.'],
    ['The service exports payroll records.', 'The service exports invoice records.'],
  ]) {
    const task = prepareRewriteTask(draft, profile, undefined, brief(source));
    assert.deepEqual(task.factRepair?.eligibleSentenceIds, []);
  }
});

test('explicit sentence authorization appears in the prompt as well as task scope', () => {
  const task = prepareRewriteTask('The queue held twelve jobs.', profile, undefined, undefined, [1]);
  assert.deepEqual(task.eligibleSentenceIds, [1]);
  assert.match(task.prompt, /Eligible sentence IDs: 1\./);
});

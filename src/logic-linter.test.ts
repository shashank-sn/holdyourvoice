import assert from 'node:assert/strict';
import test from 'node:test';
import { lintLogic } from './logic-linter.js';

test('accepts a post that develops one connected marketing argument', () => {
  const report = lintLogic('Most marketing teams measure clicks before they measure qualified conversations. That choice rewards cheap attention. We changed the weekly review to start with qualified conversations, then used click data to explain movement. The review now tells the team which message created demand.');
  assert.equal(report.passed, true);
  assert.deepEqual(report.findings, []);
});

test('blocks an abrupt, unsupported topic jump', () => {
  const report = lintLogic('The release checklist makes rollback ownership explicit. Each service owner signs the same checklist before deployment. The best espresso machines use a dual boiler for stable temperature control. The checklist now catches missing rollback steps before they become incidents.');
  assert.equal(report.passed, false);
  assert.equal(report.findings[0]?.kind, 'topic_drift');
  assert.equal(report.findings[0]?.severity, 'error');
});

test('allows an explicit bridge into a consequence', () => {
  const report = lintLogic('The compiler now records each cache key. This means the build dashboard can explain a cache miss without replaying the job. That explanation makes incident review faster.');
  assert.equal(report.passed, true);
});

test('does not treat an isolated rhetorical question as a hard topic-drift finding', () => {
  const report = lintLogic('The migration writes its recovery marker before it changes customer data. What happens if execution stops between two writes? The recovery marker lets the worker resume the migration safely.');
  assert.equal(report.passed, true);
});

test('blocks directly contradictory claims', () => {
  const report = lintLogic('The migration is ready for production. The migration is not ready for production.');
  assert.equal(report.passed, false);
  assert.equal(report.findings[0]?.kind, 'internal_contradiction');
});

test('uses the brief argument map as an additional topical anchor', () => {
  const report = lintLogic('Operators still reconcile customer changes by hand. A small approval queue records the owner and reason for each change. The queue turns a vague audit request into a traceable review.', {
    version: '1', audience: 'operators', intent: 'explain', format: 'social',
    argumentMap: { observation: 'manual customer change reconciliation', mechanism: 'approval queue', consequence: 'traceable audit review', readerValue: 'faster operator review' },
  });
  assert.equal(report.passed, true);
});

test('does not make a drift verdict for a short post', () => {
  const report = lintLogic('The release is ready. Espresso needs fresh beans.');
  assert.equal(report.passed, true);
  assert.deepEqual(report.skippedChecks, ['topic_drift_short_post']);
});

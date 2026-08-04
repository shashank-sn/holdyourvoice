import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeAiEditor, rules } from './ai-editor.js';

test('publishes executable rules with stable IDs and repair directions', () => {
  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.match(rule.id, /^ai\./);
    assert.ok(rule.reason.length > 0);
    assert.ok(rule.suggestion.length > 0);
  }
});

test('flags an executable pattern against its exact sentence', () => {
  const report = analyzeAiEditor('we will delve into it. the work is concrete.');
  assert.deepEqual(report.findings.map((finding) => [finding.id, finding.severity, finding.sentence]), [['ai.delve', 'red', 1]]);
  assert.equal(report.passed, false);
});

test('does not treat an ordinary concrete sentence as an abstract cluster', () => {
  const report = analyzeAiEditor('the editor checked the contract and sent the invoice.');
  assert.equal(report.findings.some((finding) => finding.id === 'ai.abstract-cluster'), false);
});

test('keeps yellow findings as review cues rather than release blockers', () => {
  const report = analyzeAiEditor('Firstly, the editor checked the invoice.');
  assert.ok(report.findings.every((finding) => finding.severity === 'yellow'));
  assert.equal(report.passed, true);
});

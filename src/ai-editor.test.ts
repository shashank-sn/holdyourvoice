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

test('detects every executable rule against its exact sentence', () => {
  const examples = [
    ['ai.delve', 'we will delve into it.'],
    ['ai.leverage', 'we leverage the existing logs.'],
    ['ai.tapestry', 'the tapestry explains the work.'],
    ['ai.holistic', 'a holistic review starts today.'],
    ['ai.robust', 'robust evidence supports the claim.'],
    ['ai.landscape', 'the market landscape changed.'],
    ['ai.game-changer', 'this is a game-changer.'],
    ['ai.formulaic-connector', 'Firstly, check the invoice.'],
    ['ai.hedging', 'Perhaps the invoice is late.'],
    ['ai.signpost', 'This is why the invoice matters.'],
    ['ai.not-just', 'this is not just fast but reliable.'],
    ['ai.truth-setup', 'the hard truth is in the logs.'],
    ['ai.em-dash', 'the logs failed — retry later.'],
    ['ai.question-hook', 'Have you checked the logs?'],
    ['ai.abstract-cluster', 'alignment and clarity are missing.'],
  ] as const;

  for (const [id, example] of examples) {
    const report = analyzeAiEditor(example);
    assert.deepEqual(report.findings.map((finding) => [finding.id, finding.sentence]), [[id, 1]], id);
  }
});

test('keeps a counterexample for every executable rule', () => {
  const counterexamples = [
    ['ai.delve', 'we inspect the logs.'],
    ['ai.leverage', 'we use the existing logs.'],
    ['ai.tapestry', 'the report explains the work.'],
    ['ai.holistic', 'the review covers the named files.'],
    ['ai.robust', 'the evidence includes three dated reports.'],
    ['ai.landscape', 'the market changed after the price cut.'],
    ['ai.game-changer', 'the release removed a manual step.'],
    ['ai.formulaic-connector', 'next, check the invoice.'],
    ['ai.hedging', 'the invoice is late.'],
    ['ai.signpost', 'the invoice matters because it is overdue.'],
    ['ai.not-just', 'the service is fast and reliable.'],
    ['ai.truth-setup', 'the logs show the service failed.'],
    ['ai.em-dash', 'the logs failed; retry later.'],
    ['ai.question-hook', 'the reviewer asked, have you checked the logs?'],
    ['ai.abstract-cluster', 'the editor checked the contract and sent the invoice.'],
  ] as const;

  for (const [id, example] of counterexamples) {
    assert.equal(analyzeAiEditor(example).findings.some((finding) => finding.id === id), false, id);
  }
});

test('keeps yellow findings as review cues rather than release blockers', () => {
  const report = analyzeAiEditor('Firstly, the editor checked the invoice.');
  assert.ok(report.findings.every((finding) => finding.severity === 'yellow'));
  assert.equal(report.passed, true);
});

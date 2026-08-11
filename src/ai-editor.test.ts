import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeAiEditor, rules, serializedRules } from './ai-editor.js';

test('publishes executable rules with stable IDs and repair directions', () => {
  assert.equal(rules.length, 145);
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
  for (const rule of rules) {
    assert.match(rule.id, /^(ai|formula|hedge|struct|punct|bait|cringe|insider|ogilvy)\./);
    assert.ok(rule.reason.length > 0);
    assert.ok(rule.suggestion.length > 0);
    assert.equal(rule.expression.global, false, rule.id);
    assert.equal(rule.expression.sticky, false, rule.id);
  }
});

test('detects representative rules from every inherited rule family', () => {
  const examples = [
    ['ai.delve', 'we will delve into it.'],
    ['ai.leverage', 'we leverage the existing logs.'],
    ['ai.tapestry', 'the tapestry explains the work.'],
    ['ai.holistic', 'a holistic review starts today.'],
    ['ai.robust', 'robust evidence supports the claim.'],
    ['ai.landscape', 'the market landscape changed.'],
    ['ai.game-changer', 'this is a game-changer.'],
    ['formula.firstly', 'Firstly, check the invoice.'],
    ['hedge.perhaps', 'Perhaps the invoice is late.'],
    ['struct.this-is-why', 'This is why the invoice matters.'],
    ['struct.not-just-but-also', 'this is not just fast but reliable.'],
    ['struct.rhetorical-truth', 'the hard truth is in the logs.'],
    ['punct.em-dash', 'the logs failed — retry later.'],
    ['bait.let-that-sink', 'Let that sink in.'],
    ['cringe.10x', 'The change delivered a 10x result.'],
    ['insider.nobody-tells', 'What nobody tells you is in the report.'],
    ['ogilvy.bandwidth', 'We lack the bandwidth this week.'],
  ] as const;

  for (const [id, example] of examples) {
    const report = analyzeAiEditor(example);
    assert.ok(report.findings.some((finding) => finding.id === id && finding.sentence === 1), id);
  }
});

test('keeps counterexamples for representative inherited rules', () => {
  const counterexamples = [
    ['ai.delve', 'we inspect the logs.'],
    ['ai.leverage', 'we use the existing logs.'],
    ['ai.tapestry', 'the report explains the work.'],
    ['ai.holistic', 'the review covers the named files.'],
    ['ai.robust', 'the evidence includes three dated reports.'],
    ['ai.landscape', 'the market changed after the price cut.'],
    ['ai.game-changer', 'the release removed a manual step.'],
    ['formula.firstly', 'next, check the invoice.'],
    ['hedge.perhaps', 'the invoice is late.'],
    ['struct.this-is-why', 'the invoice matters because it is overdue.'],
    ['struct.not-just-but-also', 'the service is fast and reliable.'],
    ['struct.rhetorical-truth', 'the logs show the service failed.'],
    ['punct.em-dash', 'the logs failed; retry later.'],
    ['bait.let-that-sink', 'The invoice is overdue.'],
    ['cringe.10x', 'The result rose from 2 to 20.'],
    ['insider.nobody-tells', 'The report explains the missing step.'],
    ['ogilvy.bandwidth', 'We lack time this week.'],
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

test('restores the benchmark signals from the 2.9.24 executable catalog', () => {
  const report = analyzeAiEditor(
    "This work is meaningful. Here's the part nobody is talking about. The change delivered a 10x result.",
  );

  assert.deepEqual(report.findings.map((finding) => [finding.id, finding.sentence]), [
    ['ai.meaningful', 1],
    ['struct.heres-where', 2],
    ['cringe.10x', 3],
  ]);
});

test('returns the same findings across repeated sentence and line analysis', () => {
  for (const text of ['We leverage logs. We leverage traces.', 'No demos. No decks. No distractions. Same team. Better results.']) {
    assert.deepEqual(analyzeAiEditor(text), analyzeAiEditor(text));
  }
});

test('reports the same rule in multiple sentences', () => {
  const report = analyzeAiEditor('We leverage logs. We leverage traces.');
  assert.deepEqual(
    report.findings.filter((finding) => finding.id === 'ai.leverage').map((finding) => finding.sentence),
    [1, 2],
  );
});

test('executes inherited cross-sentence rules and maps them to the first sentence', () => {
  const report = analyzeAiEditor('No demos. No decks. No distractions. Same team. Better results.');
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.id === 'struct.negation-cascade' || finding.id === 'struct.same-better')
      .map((finding) => [finding.id, finding.sentence]),
    [
      ['struct.negation-cascade', 1],
      ['struct.same-better', 4],
    ],
  );
});

test('preserves inherited physical-line matching and line-start anchors', () => {
  const sameLine = analyzeAiEditor("This isn't positioning. This is proof. Forget vanity metrics. You need retention.");
  assert.ok(sameLine.findings.some((finding) => finding.id === 'struct.this-isnt-x-this-is-y'));
  assert.ok(sameLine.findings.some((finding) => finding.id === 'struct.forget-x'));
  assert.equal(analyzeAiEditor("This isn't positioning.\nThis is proof.").findings.some((finding) => finding.id === 'struct.this-isnt-x-this-is-y'), false);
  assert.equal(analyzeAiEditor('The logs failed. Of course we can retry.').findings.some((finding) => finding.id === 'cringe.of-course'), false);
  assert.ok(analyzeAiEditor('The logs failed.\nOf course we can retry.').findings.some((finding) => finding.id === 'cringe.of-course'));
});

test('retains the current question-hook and abstract-cluster detectors', () => {
  assert.ok(analyzeAiEditor('Have you checked the invoice?').findings.some((finding) => finding.id === 'ai.question-hook'));
  assert.ok(analyzeAiEditor('Clarity and strategy are missing.').findings.some((finding) => finding.id === 'ai.abstract-cluster'));
});

test('serializes reconstructable regular expressions and explicit scopes', () => {
  const catalog = serializedRules();
  assert.equal(catalog.length, 145);
  assert.ok(catalog.every((rule) => rule.scope === 'sentence' || rule.scope === 'line'));
  const meaningful = catalog.find((rule) => rule.id === 'ai.meaningful');
  assert.ok(meaningful);
  assert.equal(new RegExp(meaningful.expression.source, meaningful.expression.flags).test('Meaningful work.'), true);
});

test('keeps intentional inherited overlaps visible and scores each finding', () => {
  const report = analyzeAiEditor('In other words, use logs.');
  assert.deepEqual(report.findings.map((finding) => finding.id), ['formula.in-other-words', 'struct.in-other-words']);
  assert.equal(report.score, 64);
});

test('returns zero AI findings for clean input', () => {
  assert.deepEqual(analyzeAiEditor('The launch starts Tuesday. The owner signed the release checklist.').findings, []);
});

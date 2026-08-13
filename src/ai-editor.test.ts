import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeAiEditor, RULESET_VERSION, rules, serializedRules } from './ai-editor.js';
import type { ProfileV3, RulePolicyState } from './contracts.js';
import { createHash } from 'node:crypto';

test('publishes executable rules with stable IDs and repair directions', () => {
  assert.equal(RULESET_VERSION, '3.2.0-reconciled.1');
  assert.equal(rules.length, 148);
  assert.equal(createHash('sha256').update(JSON.stringify(rules.map((rule) => rule.id))).digest('hex'), '8d3cdde1922686076cb3baa79c55db95f37c9088d246f47c24405417fe58f979');
  assert.equal(createHash('sha256').update(JSON.stringify(serializedRules())).digest('hex'), 'a758d7cd8e53e42d1a3ada81aff3e61f2994555d286f8915a9fc52767f145094');
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
  for (const rule of rules) {
    assert.match(rule.id, /^(ai|formula|hedge|struct|punct|bait|cringe|insider|ogilvy)\./);
    assert.ok(rule.reason.length > 0);
    assert.ok(rule.suggestion.length > 0);
    assert.equal(rule.expression.global, false, rule.id);
    assert.equal(rule.expression.sticky, false, rule.id);
  }
});

function profileWithPolicies(rulePolicy: Record<string, RulePolicyState>): ProfileV3 {
  return {
    version: '3', id: 'founder.test', revision: 1, revisionDigest: '0'.repeat(64), sampleCount: 2,
    metrics: { sentenceLength: 5, sentenceVariation: 1, sentenceStructure: [], rhythm: 1, paragraphLength: 1, openingMoves: [], vocabulary: [], lexicalDensity: 0.5, pointOfView: 'mixed', punctuation: {}, caseStyle: 'mixed', questionRate: 0, transitions: [] },
    avoid: [], provenance: { source: 'test', rights: 'test', createdAt: '2026-08-13T00:00:00.000Z' }, rulePolicy,
    fingerprint: { contractionRate: 0, sentenceLengthDistribution: { short: 1, medium: 0, long: 0 }, bulletRate: 0, enDashRate: 0 },
    tolerances: { contractionRate: { absolute: 0, calibrated: false }, sentenceLengthDistribution: { absolute: 0, calibrated: false }, bulletRate: { absolute: 0, calibrated: false }, enDashRate: { absolute: 0, calibrated: false } },
    metricFixtures: { contractionRate: ['test'], sentenceLengthDistribution: ['test'], bulletRate: ['test'], enDashRate: ['test'] },
  };
}

test('applies all four v3 policy states after matching and preserves catalog order', () => {
  const report = analyzeAiEditor(
    'Firstly, perhaps we leverage a holistic plan.',
    profileWithPolicies({
      'formula.firstly': 'blocking',
      'hedge.perhaps': 'advisory',
      'ai.leverage': 'judgment-required',
      'ai.holistic': 'disabled',
    }),
  );
  assert.deepEqual(report.findings.map((finding) => [finding.id, finding.appliedPolicy, finding.severity]), [
    ['ai.leverage', 'judgment-required', 'yellow'],
    ['formula.firstly', 'blocking', 'red'],
    ['hedge.perhaps', 'advisory', 'yellow'],
  ]);
  assert.equal(report.passed, false);
});

test('fails closed when a v3 policy names a rule outside the catalog', () => {
  assert.throws(() => analyzeAiEditor('Plain text.', profileWithPolicies({ 'ai.missing': 'blocking' })), /unknown rule ID/);
});

test('uses reconciled defaults for v2 profiles and suppresses inherited duplicate emissions', () => {
  const report = analyzeAiEditor("It's worth noting: in other words, I think the same plan. Better results.");
  assert.equal(report.findings.some((finding) => finding.id === 'hedge.worth-noting'), false);
  assert.equal(report.findings.some((finding) => finding.id === 'struct.in-other-words'), false);
  assert.equal(report.findings.some((finding) => finding.id === 'hedge.i-think'), false);
  assert.equal(report.findings.some((finding) => finding.id === 'struct.same-better'), false);
  assert.ok(report.findings.every((finding) => finding.appliedPolicy !== undefined));
});

test('treats bare red vocabulary as pending judgment and clear sincerity or dashes as blocking', () => {
  const vocabulary = analyzeAiEditor('We leverage the existing scheduler.');
  assert.deepEqual(vocabulary.findings.find((finding) => finding.id === 'ai.leverage')?.appliedPolicy, 'judgment-required');
  assert.equal(vocabulary.passed, true);
  const blocked = analyzeAiEditor('To be honest, the scheduler failed — twice.');
  assert.ok(blocked.findings.some((finding) => finding.id === 'formula.performative-sincerity' && finding.appliedPolicy === 'blocking'));
  assert.ok(blocked.findings.some((finding) => finding.id === 'punct.em-dash' && finding.appliedPolicy === 'blocking'));
  assert.equal(blocked.passed, false);
  const advisory = analyzeAiEditor('Honestly, the scheduler failed twice.');
  assert.ok(advisory.findings.some((finding) => finding.id === 'hedge.performative-sincerity-adverb' && finding.appliedPolicy === 'advisory'));
  assert.equal(advisory.passed, true);
});

test('only applies the question-hook policy to document sentence one', () => {
  assert.ok(analyzeAiEditor('Have you checked the invoice? It is overdue.').findings.some((finding) => finding.id === 'ai.question-hook'));
  assert.equal(analyzeAiEditor('The invoice is overdue. Have you checked it?').findings.some((finding) => finding.id === 'ai.question-hook'), false);
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
    [['struct.negation-cascade', 1]],
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
  assert.equal(catalog.length, 148);
  assert.ok(catalog.every((rule) => rule.scope === 'sentence' || rule.scope === 'line'));
  const meaningful = catalog.find((rule) => rule.id === 'ai.meaningful');
  assert.ok(meaningful);
  assert.equal(new RegExp(meaningful.expression.source, meaningful.expression.flags).test('Meaningful work.'), true);
});

test('suppresses intentional inherited overlaps before scoring', () => {
  const report = analyzeAiEditor('In other words, use logs.');
  assert.deepEqual(report.findings.map((finding) => finding.id), ['formula.in-other-words']);
  assert.equal(report.score, 82);
});

test('returns zero AI findings for clean input', () => {
  assert.deepEqual(analyzeAiEditor('The launch starts Tuesday. The owner signed the release checklist.').findings, []);
});

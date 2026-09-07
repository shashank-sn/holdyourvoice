import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeAiEditor, maskNonProse, RULESET_VERSION, rules, serializedRules } from './ai-editor.js';
import type { ProfileV3, RulePolicyState } from './contracts.js';
import { createHash } from 'node:crypto';
import { AI_SHADOW_FAIL_SET_V1 } from './ai-shadow-fixtures.js';
import { generateAiShadowFailSetV1 } from './ai-shadow-generator.js';

test('publishes executable rules with stable IDs and repair directions', () => {
  assert.equal(RULESET_VERSION, '3.5.0-local.4');
  assert.equal(rules.length, 183);
  assert.equal(createHash('sha256').update(JSON.stringify(rules.map((rule) => rule.id))).digest('hex'), '04f3dda979f0cd50c049c3b829bf083da24aaf46d5e1be18afdd810a6a932b26');
  assert.equal(createHash('sha256').update(JSON.stringify(serializedRules())).digest('hex'), 'e9a891f70a580ebb261754808b86134d8762102c82d3575d528a4424978fb00c');
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
  for (const rule of rules) {
    assert.match(rule.id, /^(ai|formula|hedge|struct|punct|bait|cringe|insider|ogilvy|format)\./);
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

test('allows a sample-derived punctuation exception only when no explicit policy exists', () => {
  const profile = profileWithPolicies({});
  profile.ruleAllowances = { 'punct.em-dash': { sampleCount: 2, evidenceDigest: 'a'.repeat(64) } };
  assert.equal(analyzeAiEditor('The scheduler failed — retry later.', profile).findings.some((finding) => finding.id === 'punct.em-dash'), false);
  profile.rulePolicy['punct.em-dash'] = 'blocking';
  assert.equal(analyzeAiEditor('The scheduler failed — retry later.', profile).findings.find((finding) => finding.id === 'punct.em-dash')?.appliedPolicy, 'blocking');
});

test('keeps non-prose regions out of AI Editor while scanning adjacent prose', () => {
  const tick = String.fromCharCode(96);
  const fence = tick.repeat(3);
  const draft = [
    '---',
    'title: We leverage the launch',
    '---',
    'We leverage the launch.',
    fence + 'ts',
    'const message = "We leverage logs";',
    fence,
    'Use ' + tick + 'we leverage logs' + tick + ' only as an example.',
    '[A link](https://example.com/we-leverage) stays useful.',
  ].join('\n');
  const report = analyzeAiEditor(draft);
  assert.deepEqual(report.findings.filter((finding) => finding.id === 'ai.leverage').map((finding) => finding.sentence), [1]);
  assert.equal(maskNonProse(draft).includes('https://example.com/we-leverage'), false);
});

test('preserves protected-region offsets after a supplementary Unicode character', () => {
  const tick = String.fromCharCode(96);
  const draft = '🚀 We leverage the launch. Use ' + tick + 'we leverage logs' + tick + ' as an example.';
  const report = analyzeAiEditor(draft);
  assert.deepEqual(report.findings.filter((finding) => finding.id === 'ai.leverage').map((finding) => [finding.sentence, finding.excerpt]), [
    [1, '🚀 We leverage the launch.'],
  ]);
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

test('flags theatrical colon reveals while leaving ordinary colons alone', () => {
  for (const example of [
    'The best part: it learns from the accepted edits.',
    'The detail that makes it work: a separate agent grades the draft.',
    'The real reason: the queue has no owner.',
  ]) {
    const finding = analyzeAiEditor(example).findings.find((item) => item.id === 'struct.colon-reveal');
    assert.ok(finding, example);
    assert.equal(finding.appliedPolicy, 'advisory');
  }

  for (const example of [
    'Note: the queue has no owner.',
    'The best part: A separate agent grades the draft.',
    '# The best part: it learns from accepted edits.',
    '- **The best part:** a separate agent grades the draft.',
    'Use `The best part: it learns from accepted edits.` as an example.',
    '```text\nThe best part: it learns from accepted edits.\n```',
    '[Read the note](https://example.com/the-best-part-it-learns).',
  ]) assert.equal(analyzeAiEditor(example).findings.some((item) => item.id === 'struct.colon-reveal'), false, example);

  const blocked = analyzeAiEditor('The best part: it learns from accepted edits.', profileWithPolicies({ 'struct.colon-reveal': 'blocking' }));
  assert.equal(blocked.findings.find((item) => item.id === 'struct.colon-reveal')?.appliedPolicy, 'blocking');
});

test('covers the narrow 3.5 pattern additions with an editorial example for each rule', () => {
  const examples = [
    ['ai.inflated-significance', 'This marks a pivotal moment for the project.'],
    ['ai.notability-name-drop', 'The renowned Ada Lovelace writer changed the field.'],
    ['ai.shallow-participle-analysis', 'The result matters, highlighting its importance.'],
    ['ai.promotional-scene-setting', 'In today’s changing technology landscape, the work starts.'],
    ['ai.vague-attribution', 'Experts say the change will help.'],
    ['ai.challenges-outlook', 'Despite these challenges, the future remains open.'],
    ['ai.copula-avoidance', 'The launch is serving as a testament to patience.'],
    ['ai.false-range', 'The course runs from the Big Bang to dark matter.'],
    ['ai.actorless-claim', 'It is important that we check the source.'],
    ['ai.chatbot-offer', 'Let me know if you would like another draft.'],
    ['ai.knowledge-limit-disclaimer', 'As an AI, I cannot verify that.'],
    ['ai.agreement-preamble', 'Absolutely, the invoice is overdue.'],
    ['ai.qualifier-stack', 'This is very important for the launch.'],
    ['ai.generic-positive-ending', 'The possibilities are endless.'],
    ['ai.at-its-core', 'At its core, the work is a queue.'],
    ['ai.section-announcement', 'Let us now explore the next step.'],
    ['ai.historical-implementation-aside', 'The tool was once known as Alpha and now has a new name.'],
    ['ai.unraised-objection', 'Some might argue that the queue is unnecessary.'],
    ['ai.fake-alternative', 'Whether you choose email or chat, start today.'],
    ['format.bold-bullet-label', '- **Decision:** Ship Tuesday.'],
    ['format.title-case-heading', '# Generic Title Case Heading'],
    ['format.emoji-heading', '# 🚀 Launch plan'],
    ['format.curly-quotes', 'The operator wrote “ship Tuesday” in the release note.'],
    ['format.hyphenated-modifier-stack', 'Use a high-trust-low-friction process.'],
  ] as const;
  for (const [id, example] of examples) assert.ok(analyzeAiEditor(example).findings.some((finding) => finding.id === id), id);
});

test('keeps bounded Humanizer and Ghostwriter document cues advisory', () => {
  const examples = [
    ['ai.forced-triplet', 'The template promises speed, scale, and alignment.'],
    ['ai.repeated-sentence-opening', 'We checked the logs. We checked the queue. We checked the retry.'],
    ['format.bold-density', '**Plan** stays visible. **Owner** checks it. **Proof** ships. **Next** is Tuesday.'],
    ['format.repeated-heading-body', '# Release plan\n\nRelease plan explains the verified rollback.'],
    ['ai.clipped-fragment-run', 'No demos. No decks. No distractions. The owner checked the logs.'],
    ['ai.formulaic-aphorism', 'Quality over quantity is the whole lesson.'],
    ['ai.fake-candid-opener', "I'm going to be honest: the queue failed."],
    ['ai.metric-theater', 'At 3:47 AM, the slide promised a 23.6x ROI.'],
    ['ai.jargon-stack', 'The scalable ecosystem needs alignment, leverage, and a holistic framework.'],
    ['ai.sentence-length-cluster', 'The release owner carefully checks each visible rollback instruction before the scheduled production deployment window opens this morning. The release operator carefully records each visible rollback instruction before the scheduled production deployment window opens this morning. The release reviewer carefully reviews each visible rollback instruction before the scheduled production deployment window opens this morning. The release manager carefully confirms each visible rollback instruction before the scheduled production deployment window opens this morning.'],
  ] as const;
  for (const [id, example] of examples) {
    const finding = analyzeAiEditor(example).findings.find((item) => item.id === id);
    assert.ok(finding, id);
    assert.equal(finding.appliedPolicy, 'advisory', id);
  }
  assert.equal(analyzeAiEditor('Three source IDs appear in the manifest.').findings.some((finding) => finding.id === 'ai.forced-triplet'), false);
  assert.equal(analyzeAiEditor('Owners checked the queue. Operators checked the log. Reviewers checked the proof.').findings.some((finding) => finding.id === 'ai.repeated-sentence-opening'), false);
});

test('keeps the frozen synthetic AI-shadow fail set generated in CI and executable without runtime generation', () => {
  assert.deepEqual(generateAiShadowFailSetV1(), AI_SHADOW_FAIL_SET_V1);
  for (const fixture of AI_SHADOW_FAIL_SET_V1) assert.ok(analyzeAiEditor(fixture.text).findings.some((finding) => finding.id === fixture.rule), fixture.id);
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
  assert.equal(catalog.length, 183);
  assert.ok(catalog.every((rule) => rule.scope === 'sentence' || rule.scope === 'line' || rule.scope === 'document'));
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

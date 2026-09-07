import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { lintFacts } from './fact-linter.js';

// Synthetic fixtures for source matching and claim classification.
test('does not interpret sentence-initial number words as named entities', () => {
  const report = lintFacts({
    sources: [{ id: 'survey', text: 'Nine teams reported spending less time arranging meetings; three reported no change.' }],
    draft: 'Three reported no change.',
  });
  assert.equal(report.findings.length, 0);
  assert.equal(report.claims[0]?.kinds.includes('entity'), false);
});

test('does not extract standalone discourse closers as factual claims', () => {
  for (const draft of ["That's it.", 'That’s it.']) {
    const report = lintFacts({ sources: [{ id: 'brief', text: 'The pilot lasted 12 days.' }], draft });
    assert.equal(report.claims.length, 0);
    assert.equal(report.findings.length, 0);
    assert.equal(report.summary.checked, 0);
  }
  const report = lintFacts({ sources: [{ id: 'brief', text: 'The pilot lasted 12 days.' }], draft: "That's 20 days." });
  assert.equal(report.summary.checked, 1);
  assert.equal(report.findings.length, 1);
});

test('routes semantic wording without lexical overlap to review', () => {
  const report = lintFacts({
    sources: [{ id: 'brief', text: 'The pilot reduced time spent arranging meetings.' }],
    draft: 'Scheduling became easier for participating staff.',
  });
  assert.equal(report.findings[0]?.kind, 'missing_evidence');
  assert.equal(report.findings[0]?.severity, 'needs_human_review');
});

test('does not infer entity substitution from topic overlap in capitalized prose', () => {
  const sources = [{ id: 'brief', text: 'Atlas recorded a change in meeting preparation.' }];
  for (const draft of ['Stale meeting details made preparation difficult.', 'Most participants noticed the change immediately.', 'What explains the change in preparation?', 'Let’s discuss the change after lunch.']) {
    const report = lintFacts({ sources, draft });
    assert.equal(report.findings[0]?.kind, 'missing_evidence', draft);
    assert.equal(report.findings[0]?.severity, 'needs_human_review', draft);
  }
});

test('does not infer a name swap from matching sentence-initial common nouns', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'Scheduling became easier.' }], draft: 'Planning became easier.' });
  assert.equal(report.findings[0]?.kind, 'missing_evidence');
  assert.equal(report.findings[0]?.severity, 'needs_human_review');
});

test('retains entity drift for multiword names and independently capitalized source names', () => {
  for (const [source, draft] of [
    ['Nora Reed approved the release.', 'Maya Chen approved the release.'],
    ['The team uses Atlas. Atlas approved the release.', 'Beacon approved the release.'],
  ]) {
    const report = lintFacts({ sources: [{ id: 'brief', text: source }], draft });
    assert.equal(report.findings[0]?.kind, 'entity_drift');
    assert.equal(report.findings[0]?.severity, 'error');
  }
});

test('retains high-confidence errors for source-backed drift controls', () => {
  for (const [source, draft, kind] of [
    ['Atlas retains exports for 12 days.', 'Atlas retains exports for 20 days.', 'number_drift'],
    ['Atlas exports CSV reports.', 'Atlus exports CSV reports.', 'entity_drift'],
    ['Atlas exports CSV reports.', 'Atlas exports PDF reports.', 'capability_drift'],
    ['Atlas supports CSV exports.', 'Atlas does not support CSV exports.', 'capability_drift'],
  ]) {
    const report = lintFacts({ sources: [{ id: 'brief', text: source }], draft });
    assert.equal(report.findings[0]?.kind, kind);
    assert.equal(report.findings[0]?.severity, 'error');
    assert.equal(report.findings[0]?.confidence, 'high');
  }
});

test('retains errors for unsupported concrete quantities without lexical overlap', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'The pilot ended.' }], draft: 'Revenue reached 900 dollars.' });
  assert.equal(report.findings[0]?.kind, 'unsupported_claim');
  assert.equal(report.findings[0]?.severity, 'error');
});

test('requires review for derived numbers without a matching source relation', () => {
  const report = lintFacts({
    sources: [{ id: 'brief', text: 'The monthly cost was $600 before the pilot and $400 after the pilot.' }],
    draft: 'The pilot produced $200 in monthly savings.',
  });
  assert.equal(report.findings[0]?.kind, 'missing_evidence');
  assert.equal(report.findings[0]?.severity, 'needs_human_review');
});

test('routes possible derived quantities without lexical overlap to review', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'Variant A had 1000 visitors and 40 signups. Variant B had 1000 visitors and 50 signups.' }], draft: 'A 25% lift!' });
  assert.equal(report.findings[0]?.kind, 'missing_evidence');
  assert.equal(report.findings[0]?.severity, 'needs_human_review');
});

test('does not treat unattributed rhetorical quotes as altered source quotations', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'The team reported 50 signups.' }], draft: 'Calling this "a clear winner" would overstate the evidence.' });
  assert.ok(report.findings.length > 0);
  assert.ok(report.findings.every((item) => item.severity === 'needs_human_review'));
  assert.ok(report.findings.every((item) => item.kind !== 'quote_drift'));
});

test('preserves concrete contradictions in sentences containing unattributed quoted labels', () => {
  for (const [source, draft, kind] of [
    ['The "basic" plan exports CSV files.', 'The "basic" plan exports PDF files.', 'capability_drift'],
    ['The "basic" plan supports CSV exports.', 'The "basic" plan does not support CSV exports.', 'capability_drift'],
    ['The "basic" plan retains exports for 12 days.', 'The "basic" plan retains exports for 20 days.', 'number_drift'],
  ]) {
    const report = lintFacts({ sources: [{ id: 'brief', text: source }], draft });
    assert.ok(report.findings.some((item) => item.kind === kind && item.severity === 'error'), draft);
  }
});

test('preserves unsupported quantity errors in sentences containing quoted labels', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'The "basic" plan exists.' }], draft: 'The "basic" plan costs 900 dollars.' });
  assert.ok(report.findings.some((item) => item.kind === 'unsupported_claim' && item.severity === 'error'));
});

test('does not count a quoted fragment as an assertion contradicting its enclosing denial', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'The result was inconclusive.' }], draft: 'Not "B won."' });
  assert.ok(report.findings.every((item) => item.kind !== 'draft_contradiction'));
});

test('supports evidence-backed facts and harmless paraphrases', () => {
  const report = lintFacts({
    sources: [{ id: 'release-notes', text: 'Acme launched Atlas on 14 August 2026. Atlas exports reports as CSV.' }],
    draft: 'Atlas shipped on August 14, 2026. It can export reports as CSV.',
  });
  assert.equal(report.summary.supported, 2);
  assert.equal(report.findings.length, 0);
});

test('flags numeric, date, entity, quote, and capability drift with exact evidence', () => {
  const report = lintFacts({
    sources: [{ id: 'brief', text: 'Maya Chen said, "We support 12 teams." The launch is on 14 August 2026. Atlas exports CSV reports.' }],
    draft: 'Maya Chan said, "We support 20 teams." The launch is on 15 August 2026. Atlas exports PDF reports.',
  });
  assert.deepEqual(new Set(report.findings.map((finding) => finding.kind)), new Set(['entity_drift', 'quote_drift', 'date_drift', 'capability_drift']));
  assert.ok(report.findings.every((finding) => finding.evidence[0]?.sourceId === 'brief' && finding.evidence[0]?.excerpt));
});

test('flags numeric values and units that differ from relevant evidence', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'Acme retains exports for 12 days.' }], draft: 'Acme retains exports for 12 hours.' });
  assert.equal(report.findings[0]?.kind, 'number_drift');
});

test('flags a capability whose polarity reverses the supplied source', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'Atlas supports CSV exports.' }], draft: 'Atlas does not support CSV exports.' });
  assert.equal(report.findings[0]?.kind, 'capability_drift');
});

test('routes an unsupported product capability to human review', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'Atlas supports CSV exports.' }], draft: 'Atlas supports real-time API alerts.' });
  assert.equal(report.findings[0]?.kind, 'missing_evidence');
  assert.equal(report.findings[0]?.severity, 'needs_human_review');
});

test('routes sparse overlap without a matching predicate to human review', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'Harbor Studio exists.' }], draft: 'Harbor Studio grows.' });
  assert.equal(report.findings[0]?.kind, 'missing_evidence');
  assert.equal(report.findings[0]?.severity, 'needs_human_review');
});

test('flags a single-token product name that drifts from source evidence', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'Atlas exports CSV reports.' }], draft: 'Atlus exports CSV reports.' });
  assert.equal(report.findings[0]?.kind, 'entity_drift');
});

test('flags unsupported facts and draft-internal contradictions', () => {
  const report = lintFacts({
    sources: [{ id: 'brief', text: 'The service is available in India.' }],
    draft: 'The service is available in India. The service is not available in India. The service has 99.99% uptime.',
  });
  assert.ok(report.findings.some((finding) => finding.kind === 'draft_contradiction'));
  assert.ok(report.findings.some((finding) => finding.kind === 'unsupported_claim'));
});

test('treats causal and comparative overreach as reviewable material problems', () => {
  const report = lintFacts({
    sources: [{ id: 'study', text: 'After the training, support tickets fell from 12 to 8. The study did not test causes or competitors.' }],
    draft: 'The training caused support tickets to fall and is better than every alternative.',
  });
  assert.deepEqual(new Set(report.findings.map((finding) => finding.kind)), new Set(['causal_overreach', 'comparative_overreach']));
});

test('does not flag opinions or approved hypotheses, and routes ambiguous gaps to human review', () => {
  const report = lintFacts({
    sources: [{ id: 'brief', text: 'The team is exploring a mobile app.' }],
    draft: 'I think the mobile app is a good idea. The app may reduce churn. The team is popular.',
    metadata: { approvedHypotheses: ['The app may reduce churn.'], allowedAssumptions: ['The team is popular.'] },
  });
  assert.equal(report.findings.some((finding) => finding.claim.includes('good idea')), false);
  assert.equal(report.findings.some((finding) => finding.claim.includes('may reduce churn')), false);
  assert.equal(report.findings.some((finding) => finding.claim.includes('popular')), false);
});

test('reports skipped semantic checks unless an explicitly configured adapter runs them', () => {
  const report = lintFacts({ sources: [{ id: 'brief', text: 'Atlas exists.' }], draft: 'Atlas exists.' });
  assert.deepEqual(report.skippedChecks, ['semantic_matching']);
  const external = { id: 'remote', external: true, compare: () => 'supported' as const };
  assert.deepEqual(lintFacts({ sources: [{ id: 'brief', text: 'Atlas exists.' }], draft: 'Atlas exists.', semanticAdapter: external }).skippedChecks, ['semantic_matching']);
  assert.deepEqual(lintFacts({ sources: [{ id: 'brief', text: 'Atlas exists.' }], draft: 'Atlas exists.', semanticAdapter: external, allowExternalSemantic: true }).skippedChecks, []);
  const contradicted = lintFacts({ sources: [{ id: 'brief', text: 'Atlas exists.' }], draft: 'Atlas is reliable.', semanticAdapter: { id: 'local', compare: () => 'contradicted' } });
  assert.equal(contradicted.findings[0]?.kind, 'semantic_contradiction');
});

test('keeps twenty synthetic source-grounded posts as supported regression fixtures', () => {
  const fixture = new URL('../fixtures/fact-linter/posts.json', import.meta.url);
  const posts = JSON.parse(readFileSync(fixture, 'utf8')) as { id: string; source: string; draft: string }[];
  assert.equal(posts.length, 20);
  for (const post of posts) {
    const report = lintFacts({ sources: [{ id: post.id, text: post.source }], draft: post.draft });
    assert.equal(report.findings.filter((finding) => finding.severity === 'error').length, 0, post.id);
  }
});

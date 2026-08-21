import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { lintFacts } from './fact-linter.js';

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

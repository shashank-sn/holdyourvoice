import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeBatch, analyzeEditorial, parseWritingBrief } from './editorial-packs.js';

test('uses only the selected format pack and keeps advisory format findings non-blocking', () => {
  const brief = parseWritingBrief({
    version: '1', audience: 'founders', intent: 'start a discussion', format: 'social',
  });
  const report = analyzeEditorial('A pattern I keep seeing in founder posts is vague advice.', brief);
  assert.equal(report.engine, 'editorial');
  assert.equal(report.passed, true);
  assert.deepEqual(report.findings.map((finding) => [finding.id, finding.severity, finding.sentence]), [['editorial.social.generic-opener', 'yellow', 1]]);
});

test('enforces explicit local disclosure terms independently from format guidance', () => {
  const brief = parseWritingBrief({
    version: '1', audience: 'operators', intent: 'write an update', format: 'general', prohibitedTerms: ['internal contract value'],
  });
  const report = analyzeEditorial('The internal contract value is $12,000.', brief);
  assert.equal(report.passed, false);
  assert.deepEqual(report.findings.map((finding) => [finding.id, finding.severity]), [['editorial.prohibited-term', 'red']]);
});

test('matches prohibited terms as complete normalized words or phrases', () => {
  const brief = parseWritingBrief({ version: '1', audience: 'operators', intent: 'write an update', format: 'general', prohibitedTerms: ['art'] });
  assert.equal(analyzeEditorial('We start with the delivery date.', brief).passed, true);
  assert.equal(analyzeEditorial('The art needs a signed owner.', brief).passed, false);
});

test('covers the remaining contextual format checks without applying packs outside their format', () => {
  const social = parseWritingBrief({ version: '1', audience: 'founders', intent: 'write', format: 'social' });
  assert.deepEqual(analyzeEditorial('One point.\n\nSecond point.\n\nThird point.', social).findings.map((item) => item.id), ['editorial.social.one-line-run']);
  const deck = parseWritingBrief({ version: '1', audience: 'buyers', intent: 'present', format: 'deck', title: '3 ways to improve delivery' });
  assert.deepEqual(analyzeEditorial('We make delivery simpler.', deck).findings.map((item) => item.id), ['editorial.deck.first-slide-we', 'editorial.deck.numeric-title']);
  const outreach = parseWritingBrief({ version: '1', audience: 'operators', intent: 'start a conversation', format: 'outreach' });
  assert.deepEqual(analyzeEditorial('Does that sound interesting?', outreach).findings.map((item) => item.id), ['editorial.outreach.generic-question-cta']);
  assert.deepEqual(analyzeEditorial('We make delivery simpler.', outreach).findings, []);
});

test('detects exact repeated openings and endings across a batch without judging deliberate variation', () => {
  const report = analyzeBatch([
    'The launch needs a clear owner. Start with the dependency map.',
    'The launch needs a clear owner. Start with the dependency map.',
    'The invoice needs a clear owner. Check the due date.',
  ]);
  assert.deepEqual(report.findings.map((finding) => [finding.id, finding.draftIndexes]), [
    ['batch.repeated-opening', [1, 2]],
    ['batch.repeated-ending', [1, 2]],
  ]);
});

test('rejects malformed writing briefs before they activate editorial checks', () => {
  assert.throws(() => parseWritingBrief({ version: '1', audience: '', intent: 'write', format: 'social' }), /WritingBrief/);
  assert.throws(() => parseWritingBrief({ version: '1', audience: 'founders', intent: 'write', format: 'unknown' }), /WritingBrief/);
});

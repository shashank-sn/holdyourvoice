import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanHygiene, finalOutputCheck, hygieneSourceFindings, inspectHygiene } from './hygiene.js';

test('reports zero-width, bidi, tag, and unusual-space characters with exact offsets', () => {
  const text = `one\u200Btwo\u202Ethree\u{E0001}\u00A0four`;
  const report = inspectHygiene(text);

  assert.equal(report.suspiciousCount, 4);
  assert.equal(report.fixableCount, 0);
  assert.deepEqual(report.hits.map((hit) => [hit.codepoint, hit.kind, hit.count]), [
    ['U+00A0', 'unusual_space', 1],
    ['U+200B', 'zero_width', 1],
    ['U+202E', 'bidi', 1],
    ['U+E0001', 'tag', 1],
  ]);
  assert.deepEqual(report.hits.find((hit) => hit.codepoint === 'U+E0001')?.offsets, [13]);
});

test('removes only a leading byte-order mark and preserves language, spacing, bidi, and tag controls', () => {
  const text = `\uFEFFa\u200Bb\uFEFFc\u00A0d\u200Ce\u200Df\u202Eg\u{E0001}`;
  const result = cleanHygiene(text);

  assert.equal(result.cleaned, `a\u200Bb\uFEFFc\u00A0d\u200Ce\u200Df\u202Eg\u{E0001}`);
  assert.equal(result.changed, true);
  assert.deepEqual(result.changes.map((change) => [change.codepoint, change.action]), [['U+FEFF', 'removed']]);
  assert.equal(result.report.suspiciousCount, 8);
  assert.equal(result.report.fixableCount, 1);
});

test('leaves clean text byte-for-byte unchanged', () => {
  const text = 'plain text\nwith normal spaces.';
  const result = cleanHygiene(text);

  assert.equal(result.cleaned, text);
  assert.equal(result.changed, false);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.report.hits, []);
});

test('projects eligible hygiene hits as source-offset findings', () => {
  const findings = hygieneSourceFindings('\uFEFFplain');
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.start, 0);
  assert.equal(findings[0]?.eligible, true);
});

test('groups repeated report-only hits and preserves supplementary characters', () => {
  const text = `😀\u200Bword\u200B`;
  const result = cleanHygiene(text);

  assert.equal(result.cleaned, text);
  assert.equal(result.report.suspiciousCount, 2);
  assert.equal(result.report.hits.length, 1);
  assert.equal(result.report.hits[0]?.count, 2);
  assert.deepEqual(result.report.hits[0]?.offsets, [2, 7]);
});

test('preserves multilingual spacing and word-boundary controls byte-for-byte', () => {
  const text = `ไทย\u200Bภาษา 10\u00A0kg 日本語\u3000本文 ᠮ\u180Eᠣ a\u2060b`;
  const result = cleanHygiene(text);

  assert.equal(result.cleaned, text);
  assert.equal(result.changed, false);
  assert.equal(result.report.suspiciousCount, 5);
  assert.equal(result.report.fixableCount, 0);
});

test('accepts exact clean output and minimally removes only a leading BOM', () => {
  const clean = finalOutputCheck('exact output\n');
  assert.equal(clean.accepted, true);
  assert.equal(clean.accepted && clean.output, 'exact output\n');
  assert.equal(clean.changed, false);

  const bom = finalOutputCheck('\uFEFFexact output');
  assert.equal(bom.accepted, true);
  assert.equal(bom.accepted && bom.output, 'exact output');
  assert.deepEqual(bom.changes, [{ offset: 0, codepoint: 'U+FEFF', action: 'removed' }]);
});

test('withholds output when hidden characters remain unresolved', () => {
  const result = finalOutputCheck('Thai\u200Bboundary 👩\u200D💻');

  assert.equal(result.accepted, false);
  assert.equal('output' in result, false);
  assert.equal(result.changed, false);
  assert.deepEqual(result.remaining.hits.map((hit) => hit.codepoint), ['U+200B', 'U+200D']);
});

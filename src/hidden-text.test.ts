import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHiddenTextPolicy, inspectHiddenText, minimalHiddenTextPolicy, parseHiddenTextPolicy } from './hidden-text.js';

test('removes only explicitly approved ASCII controls and mid-document BOMs with a stable receipt', () => {
  const source = 'start\u0007middle\uFEFFend';
  const receipt = applyHiddenTextPolicy(source);

  assert.equal(receipt.output, 'startmiddleend');
  assert.deepEqual(receipt.proposedChanges.map((item) => [item.codepoint, item.offset]), [['U+0007', 5], ['U+FEFF', 12]]);
  assert.equal(receipt.remaining.length, 0);
  assert.equal(receipt.idempotent, true);
  assert.notEqual(receipt.inputHash, receipt.outputHash);
});

test('keeps bidi, script joiners, emoji joiners, Markdown and tabs review-only', () => {
  const source = '```ts\nconst x = 1;\n```\nالعربية\u202E ไทย\u200Bภาษา 👩\u200D💻\tend';
  const report = inspectHiddenText(source);
  const receipt = applyHiddenTextPolicy(source);

  assert.equal(receipt.output, source);
  assert.equal(receipt.proposedChanges.length, 0);
  assert.ok(report.findings.some((item) => item.kind === 'bidi' && item.action === 'review'));
  assert.ok(report.findings.some((item) => item.kind === 'zero_width' && item.action === 'review'));
});

test('requires the exact policy shape and never broadens removals from malformed input', () => {
  assert.deepEqual(parseHiddenTextPolicy(minimalHiddenTextPolicy), minimalHiddenTextPolicy);
  assert.throws(() => parseHiddenTextPolicy({ ...minimalHiddenTextPolicy, approvedRemovals: ['zero_width'] }), /not valid/);
  assert.throws(() => parseHiddenTextPolicy({ ...minimalHiddenTextPolicy, acknowledgement: 'watermark removed' }), /not valid/);
});

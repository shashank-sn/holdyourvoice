import assert from 'node:assert/strict';
import test from 'node:test';
import type { CopySpec, RecompositionPolicyV1 } from './contracts.js';
import { buildRecompositionBrief, measureLexicalResidual, parseRecompositionPolicy } from './recomposition.js';

const policy: RecompositionPolicyV1 = {
  version: '1', mode: 'meaning-first',
  lexicalResidual: { ngramSize: 5, maxSharedNgramFraction: 0, maxLongestSharedRunTokens: 4 },
  acknowledgement: 'Measures shared wording only; does not detect or prove removal of a watermark.',
};

const copySpec: CopySpec = {
  version: '1', audience: 'operators', intent: 'explain', channel: 'email',
  claims: [{ id: 'launch-date', text: 'The launch is on 14 August.', evidence: 'Release calendar.', atoms: ['The launch is on 14 August.'] }],
};

test('parses only explicit meaning-first recomposition policies', () => {
  assert.deepEqual(parseRecompositionPolicy(policy), policy);
  assert.throws(() => parseRecompositionPolicy({ ...policy, lexicalResidual: { ...policy.lexicalResidual, ngramSize: 4 } }), /not valid/);
  assert.throws(() => parseRecompositionPolicy({ ...policy, acknowledgement: 'watermark removed' }), /not valid/);
});

test('builds a recomposition brief without carrying the source draft', () => {
  const brief = buildRecompositionBrief(copySpec, { version: '1', audience: 'operators', intent: 'explain', format: 'outreach' });
  assert.match(brief, /Meaning-first recomposition contract/);
  assert.match(brief, /The launch is on 14 August/);
  assert.doesNotMatch(brief, /watermark-free|dewatermarked/i);
});

test('measures lexical carry-over without calling it watermark detection', () => {
  const source = 'The operating review keeps the launch checklist small and the handoff calm. The launch is on 14 August.';
  const identical = measureLexicalResidual(source, source, copySpec, policy);
  assert.equal(identical.passed, false);
  assert.ok(identical.sharedNgramFraction > 0);
  assert.match(identical.statement, /not a watermark detector/);

  const fresh = measureLexicalResidual(source, 'Release owners now work from a compact calendar note. The launch is on 14 August. Nothing else in this message repeats the original framing.', copySpec, policy);
  assert.equal(fresh.passed, true);
  assert.equal(fresh.sharedNgramFraction, 0);
  assert.ok(fresh.allowedResiduals.some((item) => item.reason === 'copy-spec-atom'));
});

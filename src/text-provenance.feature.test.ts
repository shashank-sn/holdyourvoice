import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { RebuildTask, RecompositionPolicyV1 } from './contracts.js';
import { applyHiddenTextPolicy, inspectHiddenText } from './hidden-text.js';
import { provenanceStatusForRebuild, writerRequestForRebuild } from './provenance-status.js';

const feature = readFileSync(new URL('../features/text-provenance.feature', import.meta.url), 'utf8');
const policy: RecompositionPolicyV1 = { version: '1', mode: 'meaning-first', lexicalResidual: { ngramSize: 5, maxSharedNgramFraction: 0.1, maxLongestSharedRunTokens: 8 }, acknowledgement: 'Measures shared wording only; does not detect or prove removal of a watermark.' };
const task: RebuildTask = {
  version: '1', fingerprint: 'a'.repeat(64), draft: 'private source phrase', prompt: 'structured task prompt',
  copySpec: { version: '1', audience: 'operators', intent: 'explain', channel: 'email', claims: [{ id: 'date', text: 'The date is fixed.', evidence: 'calendar' }] },
  recommendationFingerprint: 'b'.repeat(64), authorizationFingerprint: 'c'.repeat(64), profileId: 'profile', profileRevisionDigest: 'd'.repeat(64), recompositionPolicy: policy,
};

function scenario(name: string, verify: () => void) {
  test(`Feature: bounded text provenance sanitation — Scenario: ${name}`, () => {
    assert.match(feature, new RegExp(`Scenario: ${name}`));
    verify();
  });
}

scenario('explicitly approved non-semantic controls are removed with evidence', () => {
  const receipt = applyHiddenTextPolicy('one\u0007two\uFEFFthree');
  assert.deepEqual(receipt.proposedChanges.map((item) => item.codepoint), ['U+0007', 'U+FEFF']);
  assert.match(receipt.inputHash, /^[a-f0-9]{64}$/); assert.match(receipt.outputHash, /^[a-f0-9]{64}$/); assert.equal(receipt.idempotent, true);
});

scenario('multilingual and structured text is review-only by default', () => {
  const source = '```md\nالعربية\u202E ไทย\u200B 👩\u200D💻\t\n```';
  const receipt = applyHiddenTextPolicy(source);
  assert.equal(receipt.output, source); assert.equal(receipt.proposedChanges.length, 0);
  assert.ok(inspectHiddenText(source).findings.every((item) => item.action === 'review'));
});

scenario('an external writer receives no source prose', () => {
  const request = writerRequestForRebuild(task);
  assert.match(request.prompt, /structured task prompt/);
  assert.doesNotMatch(JSON.stringify(request), /private source phrase|authorizationFingerprint|profileRevisionDigest|draft/);
});

scenario('unknown provider status remains explicit', () => {
  assert.deepEqual(provenanceStatusForRebuild(task), { version: '1', state: 'unknown', reason: 'private_or_unavailable_verifier' });
  assert.match(feature, /does not claim watermark removal or absence/);
});

scenario('a controlled verifier is not configured', () => {
  assert.deepEqual(provenanceStatusForRebuild({ ...task, recompositionPolicy: undefined }), { version: '1', state: 'not_configured' });
  assert.match(feature, /lexical residual is not used as a provider verifier/);
});

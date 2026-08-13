import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeBatchForMcp, analyzeForMcp, applyRewriteForMcp, buildProfileForMcp, inspectHygieneForMcp, patternsForMcp, prepareRewriteForMcp, rewritePromptForMcp, verifyCopySpecForMcp, verifyForMcp } from './mcp-tools.js';

const profile = buildProfileForMcp(['I write clearly. I keep the useful detail.', 'I make the call. Then I explain the trade-off.'], ['leverage']);
const profileJson = JSON.stringify(profile);

test('builds a portable profile for MCP without files', () => {
  assert.equal(profile.version, '2');
  assert.equal(profile.sampleCount, 2);
});

test('keeps the dual-engine analysis shape through MCP tools', () => {
  const result = analyzeForMcp('I leverage a clear plan.\u200B', profileJson);
  assert.equal(result.voiceDna.engine, 'voice_dna');
  assert.equal(result.aiEditor.engine, 'ai_editor');
  assert.equal(result.hygiene.suspiciousCount, 1);
});

test('inspects Unicode hygiene through MCP without a voice profile', () => {
  const result = inspectHygieneForMcp('one\u200Btwo\u00A0three');
  assert.equal(result.suspiciousCount, 2);
  assert.equal(result.fixableCount, 0);
});

test('accepts optional WritingBrief context and exposes batch findings through MCP helpers', () => {
  const brief = JSON.stringify({
    version: '1', audience: 'founders', intent: 'start a discussion', format: 'social', evidenceStatus: 'unverified',
    argumentMap: { observation: 'Founders repeat vague advice.', mechanism: 'The advice skips the work.', consequence: 'Readers cannot act.', readerValue: 'Avoid a vague post.' },
  });
  const analysis = analyzeForMcp('A pattern I keep seeing in founder posts is vague advice.', profileJson, brief);
  assert.ok(analysis.editorial?.findings.some((item) => item.id === 'editorial.social.generic-opener'));
  assert.ok(analysis.editorial?.findings.some((item) => item.id === 'editorial.evidence.unverified'));
  const batch = analyzeBatchForMcp(['The launch needs a clear owner.', 'The launch needs a clear owner.']);
  assert.equal(batch.findings.length, 2);
});

test('creates and verifies an editing loop through MCP tools', () => {
  const root = mkdtempSync(join(tmpdir(), 'holdyourvoice-mcp-'));
  try {
    const result = verifyForMcp('I leverage the answer with useful detail and clear mechanism.', 'I use the answer with useful detail and clear mechanism.', profileJson, { root });
    const brief = rewritePromptForMcp('I leverage a clear plan.', profileJson, { root });
    assert.match(brief.prompt, /Tier 0/);
    assert.match(brief.prompt, /Learned local preferences/);
    assert.equal(result.preservationScore >= 70, true);
    assert.equal(result.learning, 'recorded');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('exposes the executable pattern IDs through MCP tools', () => {
  const catalog = patternsForMcp();
  assert.ok(catalog.rules.some((rule) => rule.id === 'ai.leverage'));
});

test('fails closed on changed CopySpec claims through MCP tools', () => {
  const result = verifyCopySpecForMcp('The launch is on 14 August.', 'The launch is next month.', profileJson, JSON.stringify({
    version: '1', audience: 'operators', intent: 'explain', channel: 'email',
    claims: [{ id: 'launch-date', text: 'The launch is on 14 August.', evidence: 'Release calendar.' }],
  }));
  assert.equal(result.passed, false);
  assert.equal(result.claims.failures[0]?.code, 'missing_immutable_claim');
  assert.equal(result.learning, 'nothing_to_learn');
});

test('allows declared CopySpec atoms to survive a split MCP rewrite', () => {
  const spec = JSON.stringify({
    version: '1', audience: 'operators', intent: 'explain', channel: 'email',
    claims: [{ id: 'model-size', text: 'Kimi K2.6 has 600 GB of INT4 weights.', atoms: ['Kimi K2.6 uses INT4 weights', 'payload is 600 GB'], evidence: 'Technical report.' }],
  });
  const preserved = verifyCopySpecForMcp('Kimi K2.6 has 600 GB of INT4 weights.', 'Kimi K2.6 uses INT4 weights. The payload is 600 GB.', profileJson, spec);
  assert.equal(preserved.claims.passed, true);
  const missing = verifyCopySpecForMcp('Kimi K2.6 has 600 GB of INT4 weights.', 'Kimi K2.6 uses INT4 weights.', profileJson, spec);
  assert.deepEqual(missing.claims.failures.map((failure) => failure.code), ['missing_immutable_atom']);
});

test('prepares and applies the rewrite task through MCP helpers', () => {
  const task = prepareRewriteForMcp('I leverage the answer with useful detail and clear mechanism.', profileJson);
  const result = applyRewriteForMcp(JSON.stringify(task), JSON.stringify({
    version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 1, text: 'I use the answer with useful detail and clear mechanism.' }],
  }), profileJson);
  assert.equal(result.status, 'needs_semantic_review');
  assert.equal(result.candidate, 'I use the answer with useful detail and clear mechanism.');
});

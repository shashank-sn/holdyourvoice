import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeForMcp, buildProfileForMcp, patternsForMcp, rewritePromptForMcp, verifyForMcp } from './mcp-tools.js';

const profile = buildProfileForMcp(['I write clearly. I keep the useful detail.', 'I make the call. Then I explain the trade-off.'], ['leverage']);
const profileJson = JSON.stringify(profile);

test('builds a portable profile for MCP without files', () => {
  assert.equal(profile.version, '2');
  assert.equal(profile.sampleCount, 2);
});

test('keeps the dual-engine analysis shape through MCP tools', () => {
  const result = analyzeForMcp('I leverage a clear plan.', profileJson);
  assert.equal(result.voiceDna.engine, 'voice_dna');
  assert.equal(result.aiEditor.engine, 'ai_editor');
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
  assert.ok(patternsForMcp().rules.some((rule) => rule.id === 'ai.leverage'));
});

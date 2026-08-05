import assert from 'node:assert/strict';
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
  const brief = rewritePromptForMcp('I leverage a clear plan.', profileJson);
  const result = verifyForMcp('I make the call.', 'I make the call.', profileJson);
  assert.match(brief.prompt, /Tier 0/);
  assert.equal(result.preservationScore, 100);
});

test('exposes the executable pattern IDs through MCP tools', () => {
  assert.ok(patternsForMcp().rules.some((rule) => rule.id === 'ai.leverage'));
});

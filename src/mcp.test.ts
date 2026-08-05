import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { profileFingerprint } from './learning.js';
import { buildProfile } from './voice-dna.js';

test('serves local Claude tools over stdio', async () => {
  const server = spawn(process.execPath, [new URL('./mcp.js', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  server.stdout.on('data', (chunk) => { stdout += chunk; });
  server.stderr.on('data', (chunk) => { stderr += chunk; });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } })}\n`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
  server.stdin.end();
  const [code] = await once(server, 'close');
  assert.equal(stderr, '');
  assert.equal(code, 0);
  const responses = stdout.trim().split('\n').map((line) => JSON.parse(line) as { id: number; result?: { tools?: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }> } });
  const tools = responses.find((response) => response.id === 2)?.result?.tools;
  assert.deepEqual(tools?.map((tool) => tool.name), ['hyv_build_profile', 'hyv_analyze', 'hyv_rewrite_prompt', 'hyv_verify', 'hyv_patterns']);
  assert.ok(tools?.filter((tool) => tool.name !== 'hyv_verify').every((tool) => tool.annotations?.readOnlyHint));
  assert.equal(tools?.find((tool) => tool.name === 'hyv_verify')?.annotations?.readOnlyHint, false);
});

test('uses default local learning through the registered MCP tools', async () => {
  const root = mkdtempSync(join(tmpdir(), 'holdyourvoice-mcp-server-'));
  try {
    const profile = buildProfile(['I write plainly. I name the work.', 'I keep the mechanism clear. I avoid filler.'], ['leverage']);
    const server = spawn(process.execPath, [new URL('./mcp.js', import.meta.url).pathname], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HYV_HOME: root },
    });
    let stdout = '';
    let stderr = '';
    server.stdout.on('data', (chunk) => { stdout += chunk; });
    server.stderr.on('data', (chunk) => { stderr += chunk; });
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } })}\n`);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hyv_verify', arguments: { original: 'I leverage the answer with useful detail and clear mechanism.', candidate: 'I use the answer with useful detail and clear mechanism.', profile_json: JSON.stringify(profile) } } })}\n`);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'hyv_rewrite_prompt', arguments: { draft: 'I use the answer with useful detail and clear mechanism.', profile_json: JSON.stringify(profile) } } })}\n`);
    server.stdin.end();
    const [code] = await once(server, 'close');
    assert.equal(stderr, '');
    assert.equal(code, 0);
    const responses = stdout.trim().split('\n').map((line) => JSON.parse(line) as { id: number; result?: { content?: Array<{ text: string }> } });
    const prompt = JSON.parse(responses.find((response) => response.id === 3)?.result?.content?.[0]?.text ?? '{}').prompt;
    assert.match(prompt, /Learned local preferences/);
    const stored = readFileSync(join(root, 'learning', `${profileFingerprint(profile)}.jsonl`), 'utf8');
    assert.match(stored, /ai\.leverage/);
    assert.doesNotMatch(stored, /I leverage the answer/);
    assert.doesNotMatch(stored, /I use the answer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
  const server = spawn(process.execPath, [new URL('./cli.js', import.meta.url).pathname, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
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
  assert.deepEqual(tools?.map((tool) => tool.name), ['hyv_build_profile', 'hyv_analyze', 'hyv_hygiene', 'hyv_final_check', 'hyv_rewrite_prompt', 'hyv_prepare_rewrite', 'hyv_apply_rewrite', 'hyv_verify', 'hyv_verify_copy_spec', 'hyv_batch_analyze', 'hyv_patterns']);
  assert.ok(tools?.filter((tool) => tool.name !== 'hyv_verify' && tool.name !== 'hyv_verify_copy_spec').every((tool) => tool.annotations?.readOnlyHint));
  assert.equal(tools?.find((tool) => tool.name === 'hyv_verify')?.annotations?.readOnlyHint, false);
  assert.equal(tools?.find((tool) => tool.name === 'hyv_verify_copy_spec')?.annotations?.readOnlyHint, false);
});

test('accepts empty text for profile-free hygiene inspection', async () => {
  const server = spawn(process.execPath, [new URL('./cli.js', import.meta.url).pathname, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  server.stdout.on('data', (chunk) => { stdout += chunk; });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } })}\n`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hyv_hygiene', arguments: { draft: '' } } })}\n`);
  server.stdin.end();
  const [code] = await once(server, 'close');
  assert.equal(code, 0);
  const responses = stdout.trim().split('\n').map((line) => JSON.parse(line) as { id: number; result?: { content?: Array<{ text: string }> } });
  const report = JSON.parse(responses.find((response) => response.id === 2)?.result?.content?.[0]?.text ?? '{}');
  assert.equal(report.suspiciousCount, 0);
});

test('gates exact final output through the registered profile-free MCP tool', async () => {
  const server = spawn(process.execPath, [new URL('./cli.js', import.meta.url).pathname, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  server.stdout.on('data', (chunk) => { stdout += chunk; });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } })}\n`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hyv_final_check', arguments: { text: 'Exact output.' } } })}\n`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'hyv_final_check', arguments: { text: 'Hidden\u200B output.' } } })}\n`);
  server.stdin.end();
  const [code] = await once(server, 'close');
  assert.equal(code, 0);
  const responses = stdout.trim().split('\n').map((line) => JSON.parse(line) as { id: number; result?: { content?: Array<{ text: string }> } });
  const accepted = JSON.parse(responses.find((response) => response.id === 2)?.result?.content?.[0]?.text ?? '{}');
  const rejected = JSON.parse(responses.find((response) => response.id === 3)?.result?.content?.[0]?.text ?? '{}');
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.output, 'Exact output.');
  assert.equal(rejected.accepted, false);
  assert.equal('output' in rejected, false);
});

test('uses default local learning through the registered MCP tools', async () => {
  const root = mkdtempSync(join(tmpdir(), 'holdyourvoice-mcp-server-'));
  try {
    const profile = buildProfile(['I write plainly. I name the work.', 'I keep the mechanism clear. I avoid filler.'], ['leverage']);
    const server = spawn(process.execPath, [new URL('./cli.js', import.meta.url).pathname, 'mcp'], {
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
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'hyv_analyze', arguments: { draft: 'A pattern I keep seeing in founder posts is vague advice.\u200B', profile_json: JSON.stringify(profile), writing_brief_json: JSON.stringify({ version: '1', audience: 'founders', intent: 'start a discussion', format: 'social' }) } } })}\n`);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'hyv_batch_analyze', arguments: { drafts: ['The launch needs a clear owner.', 'The launch needs a clear owner.'] } } })}\n`);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'hyv_analyze', arguments: { draft: 'Plain draft.', profile_json: JSON.stringify(profile), writing_brief_json: '{' } } })}\n`);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'hyv_hygiene', arguments: { draft: 'Plain\u200B draft.' } } })}\n`);
    server.stdin.end();
    const [code] = await once(server, 'close');
    assert.equal(stderr, '');
    assert.equal(code, 0);
    const responses = stdout.trim().split('\n').map((line) => JSON.parse(line) as { id: number; result?: { content?: Array<{ text: string }>; isError?: boolean } });
    const prompt = JSON.parse(responses.find((response) => response.id === 3)?.result?.content?.[0]?.text ?? '{}').prompt;
    const contextual = JSON.parse(responses.find((response) => response.id === 4)?.result?.content?.[0]?.text ?? '{}');
    const batch = JSON.parse(responses.find((response) => response.id === 5)?.result?.content?.[0]?.text ?? '{}');
    const malformed = responses.find((response) => response.id === 6)?.result;
    const hygiene = JSON.parse(responses.find((response) => response.id === 7)?.result?.content?.[0]?.text ?? '{}');
    assert.match(prompt, /Learned local preferences/);
    assert.equal(contextual.editorial.findings[0].id, 'editorial.social.generic-opener');
    assert.equal(contextual.hygiene.suspiciousCount, 1);
    assert.deepEqual(batch.findings.map((finding: { id: string }) => finding.id), ['batch.repeated-opening', 'batch.repeated-ending']);
    assert.equal(malformed?.isError, true);
    assert.equal(hygiene.suspiciousCount, 1);
    const stored = readFileSync(join(root, 'learning', `${profileFingerprint(profile)}.jsonl`), 'utf8');
    assert.match(stored, /ai\.leverage/);
    assert.doesNotMatch(stored, /I leverage the answer/);
    assert.doesNotMatch(stored, /I use the answer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

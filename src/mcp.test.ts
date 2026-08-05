import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

test('serves the read-only Claude tools over stdio', async () => {
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
  assert.deepEqual(tools?.map((tool) => tool.name), ['hyv_build_profile', 'hyv_analyze', 'hyv_rewrite_prompt', 'hyv_verify', 'hyv_patterns']);
  assert.ok(tools?.every((tool) => tool.annotations?.readOnlyHint));
});

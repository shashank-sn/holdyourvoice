import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { profileFingerprint } from './learning.js';
import { buildProfile } from './voice-dna.js';
import { canonicalJson } from './canonical-json.js';
import { applyRewriteForMcp, prepareLifecycleForMcp, prepareRewriteForMcp } from './mcp-tools.js';

function profileV3Json() {
  const profile = buildProfile(['I write plainly. I name the work.', 'I keep the mechanism clear. I avoid filler.'], ['leverage']);
  const unsigned = { ...profile, version: '3', id: 'founder.test', revision: 1, provenance: { source: 'test', rights: 'test', createdAt: '2026-08-13T00:00:00.000Z' }, rulePolicy: {}, fingerprint: { contractionRate: 0, sentenceLengthDistribution: { short: 1, medium: 0, long: 0 }, bulletRate: 0, enDashRate: 0 }, tolerances: { contractionRate: { absolute: 0.1, calibrated: false }, sentenceLengthDistribution: { absolute: 0.1, calibrated: false }, bulletRate: { absolute: 0.1, calibrated: false }, enDashRate: { absolute: 0.1, calibrated: false } }, metricFixtures: { contractionRate: ['test'], sentenceLengthDistribution: ['test'], bulletRate: ['test'], enDashRate: ['test'] } };
  const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}` : JSON.stringify(value);
  return JSON.stringify({ ...unsigned, revisionDigest: createHash('sha256').update(canonical(unsigned)).digest('hex') });
}

async function callMcp(tools: Array<{ name: string; arguments: Record<string, unknown> }>, env: NodeJS.ProcessEnv = process.env) {
  const server = spawn(process.execPath, [new URL('./cli.js', import.meta.url).pathname, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'], env });
  let stdout = ''; let stderr = '';
  server.stdout.on('data', (chunk) => { stdout += chunk; }); server.stderr.on('data', (chunk) => { stderr += chunk; });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } })}\n`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
  tools.forEach((tool, index) => server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: tool })}\n`));
  server.stdin.end(); const [code] = await once(server, 'close'); assert.equal(code, 0); assert.equal(stderr, '');
  return stdout.trim().split('\n').map((line) => JSON.parse(line) as { id: number; result?: { content?: Array<{ text: string }>; isError?: boolean } }).filter((response) => response.id >= 2).sort((a, b) => a.id - b.id);
}

function toolPayload(response: { result?: { content?: Array<{ text: string }> } }) {
  return JSON.parse(response.result?.content?.[0]?.text ?? '{}');
}

function installedContextEnvironment(root: string, context: unknown): NodeJS.ProcessEnv {
  const home = join(root, 'home');
  const config = join(home, '.config', 'holdyourvoice');
  mkdirSync(config, { recursive: true, mode: 0o700 });
  const contextPath = join(config, 'approval-context.json');
  writeFileSync(contextPath, canonicalJson(context), { mode: 0o600 });
  chmodSync(contextPath, 0o600);
  const fakeOs = join(root, 'fake-os.mjs');
  const hooks = join(root, 'hooks.mjs');
  const register = join(root, 'register.mjs');
  writeFileSync(fakeOs, `import * as actual from 'node:os'; export const userInfo = () => ({ ...actual.userInfo(), homedir: process.env.HYV_TEST_HOME });\n`);
  writeFileSync(hooks, `export async function resolve(specifier, context, nextResolve) { if (specifier === 'node:os' && context.parentURL?.endsWith('/approval-context.js')) return { url: new URL('./fake-os.mjs', import.meta.url).href, shortCircuit: true }; return nextResolve(specifier, context); }\n`);
  writeFileSync(register, `import { register } from 'node:module'; register(new URL('./hooks.mjs', import.meta.url));\n`);
  return { ...process.env, NODE_NO_WARNINGS: '1', NODE_OPTIONS: `--import=${register}`, HYV_TEST_HOME: home };
}

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
  const responses = stdout.trim().split('\n').map((line) => JSON.parse(line) as { id: number; result?: { tools?: Array<{ name: string; inputSchema?: { properties?: Record<string, unknown> }; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }> } });
    const tools = responses.find((response) => response.id === 2)?.result?.tools;
  assert.deepEqual(tools?.map((tool) => tool.name), ['hyv_build_profile', 'hyv_analyze', 'hyv_hygiene', 'hyv_inspect_hidden_text', 'hyv_apply_hidden_text_policy', 'hyv_final_check', 'hyv_logic_lint', 'hyv_rewrite_prompt', 'hyv_prepare_rewrite', 'hyv_apply_rewrite', 'hyv_prepare_judgment', 'hyv_reduce_judgment', 'hyv_verify', 'hyv_verify_copy_spec', 'hyv_batch_analyze', 'hyv_patterns', 'hyv_learning_inspect', 'hyv_learning_record', 'hyv_learning_ratify', 'hyv_learning_supersede', 'hyv_learning_migrate', 'hyv_learning_clear', 'hyv_lifecycle_prepare_semantic', 'hyv_lifecycle_submit_verdict', 'hyv_lifecycle_inspect', 'hyv_lifecycle_finalize']);
  assert.ok(tools?.filter((tool) => !['hyv_verify', 'hyv_verify_copy_spec', 'hyv_apply_hidden_text_policy', 'hyv_learning_record', 'hyv_learning_ratify', 'hyv_learning_supersede', 'hyv_learning_migrate', 'hyv_learning_clear'].includes(tool.name)).every((tool) => tool.annotations?.readOnlyHint));
  assert.equal(tools?.find((tool) => tool.name === 'hyv_verify')?.annotations?.readOnlyHint, true);
  assert.equal(tools?.find((tool) => tool.name === 'hyv_verify_copy_spec')?.annotations?.readOnlyHint, true);
  assert.equal(tools?.some((tool) => tool.name === 'hyv_lifecycle_validate_final_approval'), false);
  assert.equal(tools?.some((tool) => tool.name === 'hyv_learning_record_approved'), false);
  assert.equal(tools?.some((tool) => tool.name === 'hyv_prepare_rebuild'), false);
  assert.equal(tools?.some((tool) => tool.name === 'hyv_apply_rebuild'), false);
  assert.equal('capability_json' in (tools?.find((tool) => tool.name === 'hyv_lifecycle_finalize')?.inputSchema?.properties ?? {}), false);
  assert.equal(tools?.find((tool) => tool.name === 'hyv_learning_inspect')?.annotations?.readOnlyHint, true);
  assert.equal(tools?.find((tool) => tool.name === 'hyv_inspect_hidden_text')?.annotations?.readOnlyHint, true);
  assert.equal(tools?.find((tool) => tool.name === 'hyv_logic_lint')?.annotations?.readOnlyHint, true);
  assert.equal(tools?.find((tool) => tool.name === 'hyv_apply_hidden_text_policy')?.annotations?.readOnlyHint, false);
  assert.equal(tools?.find((tool) => tool.name === 'hyv_learning_clear')?.annotations?.readOnlyHint, false);
  assert.deepEqual(tools?.filter((tool) => tool.name.startsWith('hyv_learning_')).map((tool) => [tool.name, tool.annotations?.readOnlyHint, tool.annotations?.destructiveHint]), [
    ['hyv_learning_inspect', true, undefined], ['hyv_learning_record', false, false], ['hyv_learning_ratify', false, false],
    ['hyv_learning_supersede', false, true], ['hyv_learning_migrate', false, false], ['hyv_learning_clear', false, true],
  ]);
});

test('registers capability tools only with host redaction attestation', async () => {
  const server = spawn(process.execPath, [new URL('./cli.js', import.meta.url).pathname, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HYV_MCP_SENSITIVE_INPUT_REDACTION: '1' } });
  let stdout = ''; let stderr = '';
  server.stdout.on('data', (chunk) => { stdout += chunk; }); server.stderr.on('data', (chunk) => { stderr += chunk; });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } })}\n`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`); server.stdin.end();
  const [code] = await once(server, 'close'); assert.equal(code, 0); assert.equal(stderr, '');
  const response = stdout.trim().split('\n').map((line) => JSON.parse(line)).find((item) => item.id === 2);
  const names = response.result.tools.map((tool: { name: string }) => tool.name);
  assert.equal(names.length, 31);
  assert.ok(names.includes('hyv_lifecycle_validate_final_approval'));
  assert.ok(names.includes('hyv_learning_record_approved'));
  assert.ok(names.includes('hyv_prepare_rebuild'));
  assert.ok(names.includes('hyv_apply_rebuild'));
  assert.ok(names.includes('hyv_rebuild_writer_request'));
  const finalize = response.result.tools.find((tool: { name: string }) => tool.name === 'hyv_lifecycle_finalize');
  assert.equal('capability_json' in finalize.inputSchema.properties, true);
});

test('redacts rebuild prepare transport failures', async () => {
  const secret = 'rebuild-prepare-secret-nonce';
  const responses = await callMcp([{ name: 'hyv_prepare_rebuild', arguments: { draft: 'x', profile_json: '{}', reduction_json: '{}', copy_spec_json: '{}', capability_json: JSON.stringify({ payload: secret, signature: secret }) } }], { ...process.env, HYV_MCP_SENSITIVE_INPUT_REDACTION: '1' });
  const serialized = JSON.stringify(responses[0]);
  assert.equal(responses[0]?.result?.isError, true);
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.match(serialized, /Rebuild preparation failed/);
});

test('redacts rebuild apply transport failures', async () => {
  const secret = 'rebuild-apply-secret-nonce';
  const responses = await callMcp([{ name: 'hyv_apply_rebuild', arguments: { task_json: '{}', response_json: '{}', profile_json: '{}', capability_json: JSON.stringify({ payload: secret, signature: secret }) } }], { ...process.env, HYV_MCP_SENSITIVE_INPUT_REDACTION: '1' });
  const serialized = JSON.stringify(responses[0]);
  assert.equal(responses[0]?.result?.isError, true);
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.match(serialized, /Rebuild application failed/);
});

test('redacts capability-bearing transport failures', async () => {
  const secret = 'transport-secret-nonce';
  const responses = await callMcp([{ name: 'hyv_lifecycle_validate_final_approval', arguments: { artifact_json: '{}', capability_json: JSON.stringify({ payload: secret, signature: secret }) } }], { ...process.env, HYV_MCP_SENSITIVE_INPUT_REDACTION: '1' });
  const serialized = JSON.stringify(responses[0]);
  assert.equal(responses[0]?.result?.isError, true);
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.match(serialized, /Capability validation failed/);
});

test('runs registered lifecycle preparation and inspection over stdio', async () => {
  const base = { version: '1', verificationKind: 'standard', passed: true, analysisVersion: '2', rulesetVersion: '3.2.0', preservationMetricVersion: 'legacy-set-v1', preservationScore: 100, sourceHash: '4'.repeat(64), candidateHash: '5'.repeat(64), profileId: 'founder.primary', profileRevisionDigest: '6'.repeat(64), regressionKeys: [] };
  const deterministic = { ...base, artifactFingerprint: createHash('sha256').update(`hyv:deterministic-verification:v1\0${canonicalJson(base)}`).digest('hex') };
  const binding = { rewriteTaskFingerprint: '1'.repeat(64), rewriteResponseFingerprint: '2'.repeat(64), deterministicArtifactFingerprint: deterministic.artifactFingerprint, sourceHash: deterministic.sourceHash, candidateHash: deterministic.candidateHash, profileId: deterministic.profileId, profileRevisionDigest: deterministic.profileRevisionDigest, rulesetVersion: deterministic.rulesetVersion, schemaVersion: '1' };
  const receipt = { version: '1', taskFingerprint: binding.rewriteTaskFingerprint, responseFingerprint: binding.rewriteResponseFingerprint, adapterIds: [], replacementSentenceIds: [1] };
  const preparedResponse = await callMcp([{ name: 'hyv_lifecycle_prepare_semantic', arguments: { deterministic_json: JSON.stringify(deterministic), binding_json: JSON.stringify(binding), receipt_json: JSON.stringify(receipt), policy: 'normal', allowed_violations: ['action_change'] } }], { ...process.env, HYV_MCP_SENSITIVE_INPUT_REDACTION: '' });
  const prepared = toolPayload(preparedResponse[0]); assert.equal(prepared.artifact.status, 'needs_semantic_review');
  const inspectedResponse = await callMcp([{ name: 'hyv_lifecycle_inspect', arguments: { artifact_json: JSON.stringify(prepared.artifact) } }]);
  const inspected = toolPayload(inspectedResponse[0]); assert.equal(inspected.artifactFingerprint, prepared.artifact.artifactFingerprint);
  assert.doesNotMatch(JSON.stringify(inspected), /sourceHash|candidateHash|payload|signature|nonce/);
});

test('runs signed lifecycle and approved-learning replay through registered stdio tools', async () => {
  const root = mkdtempSync(join(tmpdir(), 'holdyourvoice-mcp-approved-'));
  try {
    const source = 'I leverage the answer with useful detail and clear mechanism.';
    const candidate = 'I use the answer with useful detail and clear mechanism.';
    const profile = buildProfile(['I write plainly. I name the work.', 'I keep the mechanism clear. I avoid filler.'], ['leverage']);
    const profileJson = JSON.stringify(profile);
    const rewriteTask = prepareRewriteForMcp(source, profileJson);
    const evaluation = applyRewriteForMcp(JSON.stringify(rewriteTask), JSON.stringify({ version: '1', taskFingerprint: rewriteTask.fingerprint, replacements: [{ sentenceId: 1, text: candidate }] }), profileJson);
    assert.equal(evaluation.status, 'needs_semantic_review');
    const prepared = prepareLifecycleForMcp(JSON.stringify(evaluation.deterministicArtifact), JSON.stringify(evaluation.lifecycleBinding), JSON.stringify(evaluation.receipt), 'normal', []);
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const now = Math.floor(Date.now() / 1000);
    const trustStore = { version: '1', audience: '@holdyourvoice/hyv', maxCapabilityLifetimeSeconds: 300, keys: [{ issuer: 'test-host', keyId: 'test-key', publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'), status: 'active' }] };
    const context = { now: 0, trustStore, authorizedSemanticEvaluatorIds: { normal: ['test-reviewer'], highAssurance: [] }, authorizedHumanFinalizerIds: ['test-human'] };
    const env = { ...installedContextEnvironment(root, context), HYV_HOME: join(root, 'state'), HYV_MCP_SENSITIVE_INPUT_REDACTION: '1' };
    const submittedResponse = await callMcp([{ name: 'hyv_lifecycle_submit_verdict', arguments: { artifact_json: JSON.stringify(prepared.artifact), task_json: JSON.stringify(prepared.task), evaluator_id: 'test-reviewer', verdict_json: JSON.stringify({ approved: true, violations: [] }) } }], env);
    const ready = toolPayload(submittedResponse[0]);
    assert.equal(ready.status, 'ready_for_human_review');
    const rejectedResponse = await callMcp([{ name: 'hyv_lifecycle_finalize', arguments: { artifact_json: JSON.stringify(ready), decision_json: JSON.stringify({ evaluatorId: 'test-human', decision: 'reject' }) } }], { ...env, HYV_MCP_SENSITIVE_INPUT_REDACTION: '' });
    const rejected = toolPayload(rejectedResponse[0]);
    assert.equal(rejected.status, 'needs_escalation');
    assert.equal(rejected.reason, 'human_rejection');
    const binding = ready.binding;
    const claims = { version: '1', purpose: 'hyv.final-approval', issuer: 'test-host', audience: '@holdyourvoice/hyv', subjectArtifactFingerprint: ready.artifactFingerprint, sourceHash: binding.sourceHash, candidateHash: binding.candidateHash, profileId: binding.profileId, profileRevisionDigest: binding.profileRevisionDigest, keyId: 'test-key', issuedAt: now - 1, notBefore: now - 1, expiresAt: now + 120, nonce: 'registered-secret-nonce' };
    const payload = Buffer.from(canonicalJson(claims));
    const capability = canonicalJson({ payload: payload.toString('base64url'), signature: sign(null, payload, privateKey).toString('base64url') });
    const decision = JSON.stringify({ evaluatorId: 'test-human', decision: 'approve' });
    const approvalResponses = await callMcp([
      { name: 'hyv_lifecycle_validate_final_approval', arguments: { artifact_json: JSON.stringify(ready), capability_json: capability } },
      { name: 'hyv_lifecycle_finalize', arguments: { artifact_json: JSON.stringify(ready), decision_json: decision, capability_json: capability } },
    ], env);
    assert.equal(toolPayload(approvalResponses[0]).ok, true);
    const approved = toolPayload(approvalResponses[1]);
    assert.equal(approved.status, 'approved');
    const learningArguments = { ready_json: JSON.stringify(ready), approved_json: JSON.stringify(approved), original: source, candidate, profile_json: profileJson, decision_json: decision, capability_json: capability };
    const learned = await callMcp([
      { name: 'hyv_learning_record_approved', arguments: learningArguments },
      { name: 'hyv_learning_record_approved', arguments: learningArguments },
    ], env);
    assert.equal(toolPayload(learned[0]).status, 'recorded');
    assert.equal(toolPayload(learned[1]).status, 'nothing_to_learn');
    const serialized = JSON.stringify({ submittedResponse, rejectedResponse, approvalResponses, learned });
    assert.doesNotMatch(serialized, /registered-secret-nonce|payload|signature|I leverage|I use/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('runs the registered MCP learning lifecycle and rejects invalid profile versions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'holdyourvoice-mcp-lifecycle-'));
  try {
    const env = { ...process.env, HYV_HOME: root };
    const v2Json = JSON.stringify(buildProfile(['I write plainly. I name the work.', 'I keep the mechanism clear. I avoid filler.'], ['leverage']));
    const v3Json = profileV3Json();
    const first = await callMcp([
      { name: 'hyv_learning_record', arguments: { profile_json: v3Json, instruction: 'Keep the mechanism concrete.', mutation_id: 'm1', authority: 'founder', provenance: 'review', weight: 2, compatibility: 'exact' } },
      { name: 'hyv_learning_inspect', arguments: { profile_json: v3Json } },
      { name: 'hyv_learning_record', arguments: { profile_json: v2Json, instruction: 'Keep the evidence named.', mutation_id: 'legacy-1' } },
      { name: 'hyv_learning_migrate', arguments: { source_profile_json: v2Json, target_profile_json: v3Json, mutation_id: 'migration-1' } },
      { name: 'hyv_learning_ratify', arguments: { profile_json: v2Json, event_id: 'invalid' } },
      { name: 'hyv_learning_migrate', arguments: { source_profile_json: v3Json, target_profile_json: v2Json } },
      { name: 'hyv_learning_record', arguments: { profile_json: v3Json, instruction: 'Invalid schema.', mutation_id: 'm'.repeat(201) } },
    ], env);
    const recorded = toolPayload(first[0]);
    assert.equal(recorded.status, 'recorded');
    assert.equal(toolPayload(first[1])[0].eventType, 'instruction');
    assert.equal(toolPayload(first[2]).status, 'recorded');
    assert.equal(toolPayload(first[3]).status, 'recorded');
    assert.equal(first[4]?.result?.isError, true);
    assert.equal(first[5]?.result?.isError, true);
    assert.equal(first[6]?.result?.isError, true);

    const second = await callMcp([
      { name: 'hyv_learning_record', arguments: { profile_json: v3Json, instruction: 'Different instruction.', mutation_id: 'm1' } },
      { name: 'hyv_learning_ratify', arguments: { profile_json: v3Json, event_id: recorded.eventId, mutation_id: 'm2', authority: 'founder' } },
      { name: 'hyv_learning_supersede', arguments: { profile_json: v3Json, event_id: recorded.eventId, mutation_id: 'm3', authority: 'founder' } },
      { name: 'hyv_learning_clear', arguments: { profile_json: v3Json } },
      { name: 'hyv_learning_inspect', arguments: { profile_json: v3Json } },
    ], env);
    assert.equal(toolPayload(second[0]).status, 'conflict');
    assert.equal(toolPayload(second[1]).status, 'recorded');
    assert.equal(toolPayload(second[2]).status, 'recorded');
    assert.equal(toolPayload(second[3]).cleared, true);
    assert.deepEqual(toolPayload(second[4]), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
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

test('keeps registered MCP verification read-only', async () => {
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
    assert.doesNotMatch(prompt, /Learned local preferences/);
    assert.equal(contextual.editorial.findings[0].id, 'editorial.social.generic-opener');
    assert.equal(contextual.hygiene.suspiciousCount, 1);
    assert.deepEqual(batch.findings.map((finding: { id: string }) => finding.id), ['batch.repeated-opening', 'batch.repeated-ending']);
    assert.equal(malformed?.isError, true);
    assert.equal(hygiene.suspiciousCount, 1);
    assert.equal(existsSync(join(root, 'learning', `${profileFingerprint(profile)}.jsonl`)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

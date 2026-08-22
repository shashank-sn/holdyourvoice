import assert from 'node:assert/strict';
import test from 'node:test';
import { describe, emitJson, emitPrompt } from './emit.js';
import { AGENT_SCHEMA_VERSION, type AgentPackage } from './types.js';

function makePackage(id: string): AgentPackage {
  return {
    directory: '/pkg',
    instructions: 'Usage: hyv verify original.md candidate.md profile.json',
    descriptor: {
      schema_version: AGENT_SCHEMA_VERSION,
      id,
      title: 'hyv-verify',
      description: 'verify a candidate',
      instruction_file: 'SKILL.md',
      role: 'Verifier',
      workflow_phase: 'verify',
      input: { required: ['original', 'candidate'], optional: ['writing brief'] },
      output: { required: ['verification report'], optional: [] },
      evidence_requirements: ['preserve revision evidence'],
      permissions: ['read_repository', 'network'],
      stop_conditions: ['stop when evidence is stale'],
      tool_free_mode: {
        available: true,
        behavior: 'report the decision and exact unavailable capability',
        unavailable_statuses: ['NOT_AVAILABLE', 'NOT_CONFIGURED', 'NOT_RUN', 'STALE', 'ERROR'],
      },
      handoff_to: ['hyv-lifecycle'],
    },
  };
}

test('describe resolves a host and returns a runtime descriptor', () => {
  const resolved = describe(makePackage('hyv-verify'), 'codex');
  assert.equal(resolved.agent.id, 'hyv-verify');
  assert.equal(resolved.host.id, 'codex');
  assert.ok(resolved.available_capabilities.includes('read_repository'));
  assert.deepEqual(resolved.unavailable_capabilities, [{ capability: 'network', status: 'NOT_AVAILABLE' }]);
  assert.equal(resolved.execution_mode, 'prompt-only');
});

test('emitJson renders a valid JSON runtime descriptor', () => {
  const body = emitJson(makePackage('hyv-verify'), 'generic');
  const parsed = JSON.parse(body);
  assert.equal(parsed.agent.id, 'hyv-verify');
  assert.equal(parsed.host.id, 'generic');
  assert.ok(Array.isArray(parsed.unavailable_capabilities));
  assert.deepEqual(parsed.unavailable_capabilities, [
    { capability: 'read_repository', status: 'NOT_AVAILABLE' },
    { capability: 'network', status: 'NOT_AVAILABLE' },
  ]);
});

test('emitPrompt includes instructions, capability boundary, and required statuses', () => {
  const prompt = emitPrompt(makePackage('hyv-verify'), 'codex');
  assert.match(prompt, /# hyv-verify/);
  assert.match(prompt, /Role: Verifier/);
  assert.match(prompt, /Usage: hyv verify original\.md candidate\.md profile\.json/);
  assert.match(prompt, /Available: read_repository/);
  assert.match(prompt, /Unavailable: network \(NOT_AVAILABLE\)/);
  assert.match(prompt, /NOT_AVAILABLE, NOT_CONFIGURED, NOT_RUN, STALE, ERROR/);
  assert.match(prompt, /Next agents: hyv-lifecycle/);
});

test('emitPrompt reports no available capabilities for a fully unavailable host', () => {
  const prompt = emitPrompt(makePackage('hyv-verify'), 'generic');
  assert.match(prompt, /Available: none/);
  assert.match(prompt, /Execution mode: prompt-only/);
});

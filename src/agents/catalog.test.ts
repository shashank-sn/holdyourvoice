import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHost, listHosts, runtime } from './catalog.js';
import { AGENT_SCHEMA_VERSION, type AgentDescriptor } from './types.js';

function minimalDescriptor(id: string, permissions: string[]): AgentDescriptor {
  return {
    schema_version: AGENT_SCHEMA_VERSION,
    id,
    title: id,
    description: 'test',
    instruction_file: 'SKILL.md',
    role: 'Tester',
    workflow_phase: 'test',
    input: { required: ['draft'], optional: [] },
    output: { required: ['report'], optional: [] },
    evidence_requirements: ['evidence'],
    permissions,
    stop_conditions: ['stop'],
    tool_free_mode: { available: true, behavior: 'report', unavailable_statuses: ['NOT_AVAILABLE'] },
    handoff_to: [],
  };
}

test('resolves known hosts and falls back to generic for unknown ids', () => {
  assert.equal(resolveHost('codex').id, 'codex');
  assert.equal(resolveHost('future-ide').id, 'generic');
  assert.equal(resolveHost('future-ide').native_skills, false);
  assert.equal(resolveHost('future-ide').cli, true);
});

test('catalog has unique host ids and includes generic', () => {
  const hosts = listHosts();
  const ids = hosts.map((host) => host.id);
  assert.ok(ids.includes('generic'));
  assert.equal(new Set(ids).size, ids.length);
});

test('runtime marks unsupported permissions unavailable and switches to prompt-only', () => {
  const descriptor = minimalDescriptor('hyv-verify', ['read_repository', 'network', 'subagents']);
  const resolved = runtime(descriptor, 'generic');
  assert.deepEqual(resolved.available_capabilities, []);
  assert.deepEqual(resolved.unavailable_capabilities, [
    { capability: 'read_repository', status: 'NOT_AVAILABLE' },
    { capability: 'network', status: 'NOT_AVAILABLE' },
    { capability: 'subagents', status: 'NOT_AVAILABLE' },
  ]);
  assert.equal(resolved.execution_mode, 'prompt-only');
});

test('runtime uses native mode when the host supports every permission', () => {
  const descriptor = minimalDescriptor('hyv-verify', ['read_repository', 'execute_commands']);
  const resolved = runtime(descriptor, 'codex');
  assert.deepEqual(resolved.available_capabilities, ['read_repository', 'execute_commands']);
  assert.deepEqual(resolved.unavailable_capabilities, []);
  assert.equal(resolved.execution_mode, 'native');
});

test('network is never available on any host', () => {
  for (const host of listHosts()) {
    const resolved = runtime(minimalDescriptor('hyv-verify', ['network']), host.id);
    assert.deepEqual(resolved.available_capabilities, []);
    assert.deepEqual(resolved.unavailable_capabilities, [{ capability: 'network', status: 'NOT_AVAILABLE' }]);
    assert.equal(resolved.execution_mode, 'prompt-only');
  }
});

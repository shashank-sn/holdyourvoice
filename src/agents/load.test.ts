import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAll, loadAllFrom, validateAll, validateId, sortedIds } from './load.js';
import { AGENT_SCHEMA_VERSION } from './types.js';

function makePackage(dir: string, id: string, overrides: Record<string, unknown> = {}): string {
  const packageDir = join(dir, 'skills', id);
  mkdirSync(join(packageDir, 'agents'), { recursive: true });
  const descriptor = {
    schema_version: AGENT_SCHEMA_VERSION,
    id,
    title: id,
    description: 'test agent',
    instruction_file: 'SKILL.md',
    role: 'Tester',
    workflow_phase: 'test',
    input: { required: ['draft'], optional: [] },
    output: { required: ['report'], optional: [] },
    evidence_requirements: ['preserve evidence'],
    permissions: ['read_repository'],
    stop_conditions: ['stop when evidence missing'],
    tool_free_mode: {
      available: true,
      behavior: 'report NOT_AVAILABLE',
      unavailable_statuses: ['NOT_AVAILABLE', 'NOT_RUN'],
    },
    handoff_to: [],
    ...overrides,
  };
  writeFileSync(join(packageDir, 'agent.json'), JSON.stringify(descriptor));
  writeFileSync(join(packageDir, 'SKILL.md'), `# ${id}\n\nUsage: hyv ${id} draft.md\n`);
  writeFileSync(join(packageDir, 'agents', 'openai.yaml'), `interface:\n  display_name: "${id}"\n  short_description: "test agent"\n  default_prompt: "Use ${id}"\n`);
  return packageDir;
}

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'hyv-agents-'));
}

test('loads all valid packages and rejects unknown schema version', () => {
  const root = makeTempRoot();
  try {
    const first = makePackage(root, 'hyv-alpha');
    makePackage(root, 'hyv-beta', { handoff_to: ['hyv-alpha'] });
    const packages = loadAllFrom(root);
    assert.deepEqual(sortedIds(packages), ['hyv-alpha', 'hyv-beta']);
    assert.equal(packages.get('hyv-alpha')!.directory, first);
    assert.match(packages.get('hyv-alpha')!.instructions, /^# hyv-alpha/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a package whose id does not match its directory name', () => {
  const root = makeTempRoot();
  try {
    makePackage(root, 'hyv-alpha', { id: 'hyv-mismatch' });
    assert.throws(() => loadAllFrom(root), /id must match skill directory/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a handoff target that does not exist', () => {
  const root = makeTempRoot();
  try {
    makePackage(root, 'hyv-alpha', { handoff_to: ['hyv-ghost'] });
    assert.throws(() => loadAllFrom(root), /hands off to unknown agent/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an unsupported permission and an unsupported status', () => {
  const root = makeTempRoot();
  try {
    makePackage(root, 'hyv-alpha', { permissions: ['definitely-not-real'] });
    assert.throws(() => loadAllFrom(root), /unsupported permission/);
    rmSync(root, { recursive: true, force: true });
    const root2 = makeTempRoot();
    makePackage(root2, 'hyv-beta', {
      tool_free_mode: { available: true, behavior: 'x', unavailable_statuses: ['NOPE'] },
    });
    assert.throws(() => loadAllFrom(root2), /tool_free_mode requires/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validateAll and validateId report PASS or unknown id', () => {
  const root = makeTempRoot();
  try {
    makePackage(root, 'hyv-alpha');
    const packages = loadAllFrom(root);
    validateAll(packages);
    validateId(packages, 'hyv-alpha');
    assert.throws(() => validateId(packages, 'hyv-missing'), /unknown agent/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a malformed agent.json', () => {
  const root = makeTempRoot();
  try {
    const packageDir = join(root, 'skills', 'hyv-alpha');
    mkdirSync(join(packageDir, 'agents'), { recursive: true });
    writeFileSync(join(packageDir, 'agent.json'), '{ not json');
    writeFileSync(join(packageDir, 'SKILL.md'), '# x');
    assert.throws(() => loadAllFrom(root), /not valid JSON/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unknown contract fields and invalid OpenAI interface metadata', () => {
  const root = makeTempRoot();
  try {
    makePackage(root, 'hyv-alpha', { unsupported: true });
    assert.throws(() => loadAllFrom(root), /supported contract fields/);
    rmSync(root, { recursive: true, force: true });

    const root2 = makeTempRoot();
    const packageDir = makePackage(root2, 'hyv-beta');
    rmSync(join(packageDir, 'agents', 'openai.yaml'));
    assert.throws(() => loadAllFrom(root2), /openai\.yaml/);
    rmSync(root2, { recursive: true, force: true });

    const root3 = makeTempRoot();
    const invalidPackageDir = makePackage(root3, 'hyv-gamma');
    writeFileSync(join(invalidPackageDir, 'agents', 'openai.yaml'), 'interface:\n  display_name: "unterminated\n  short_description: "test"\n  default_prompt: "Use hyv-gamma"\n');
    assert.throws(() => loadAllFrom(root3), /supported interface metadata/);
    rmSync(root3, { recursive: true, force: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('published packages declare command execution and required writes', () => {
  const packages = loadAll();
  const writers = new Set(['hyv-profile', 'hyv-hygiene', 'hyv-apply-hidden-text-policy', 'hyv-prepare-rewrite', 'hyv-prepare-judgment', 'hyv-prepare-rebuild', 'hyv-rebuild-writer-request', 'hyv-lifecycle', 'hyv-learning']);
  for (const [id, pkg] of packages) {
    assert.ok(pkg.descriptor.permissions.includes('execute_commands'), `${id} must require command execution`);
    assert.equal(pkg.descriptor.permissions.includes('write_repository'), writers.has(id), `${id} write permission mismatch`);
  }
});

test('published instructions document command-specific argument requirements', () => {
  const packages = loadAll();
  assert.match(packages.get('hyv-reduce-judgment')!.instructions, /hyv reduce-judgment envelope\.json envelope\.json envelope\.json \[envelope\.json\.\.\.\]/);
  assert.match(packages.get('hyv-learning')!.instructions, /record-approved/);
});

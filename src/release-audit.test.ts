import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const audit = new URL('../scripts/release-audit.mjs', import.meta.url).pathname;
const stage1Files = [
  'scripts/evaluate-rewrite-benchmark.mjs',
  'scripts/run-stage1-dry-run.mjs',
  'scripts/run-stage1-human-packet.mjs',
  'benchmarks/schema/protocol-manifest.v1.schema.json',
  'benchmarks/schema/run-event.v1.schema.json',
  'benchmarks/schema/blind-packet.v1.schema.json',
  'benchmarks/schema/blind-mapping.v1.schema.json',
  'benchmarks/schema/reviewer-record.v1.schema.json',
  'benchmarks/schema/ratings-seal.v1.schema.json',
  'benchmarks/schema/aggregate-report.v1.schema.json',
  'benchmarks/schema/checkpoint-disposition.v1.schema.json',
];

function fixture(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-audit-'));
  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  const defaults = {
    'package.json': JSON.stringify({ name: 'audit-fixture', license: 'MIT', files: ['dist', 'Readme.md', 'LICENSE'], scripts: { 'stage1:evaluate': 'node scripts/evaluate-rewrite-benchmark.mjs', 'stage1:dry-run': 'npm run build && node scripts/run-stage1-dry-run.mjs', 'stage1:human-packet': 'npm run build && node scripts/run-stage1-human-packet.mjs' }, version: '1.0.0', type: 'module', bin: { hyv: 'dist/cli.js' }, engines: { node: '>=20' } }),
    'mcpb/manifest.json': JSON.stringify({ version: '1.0.0' }),
    'claude-plugin/.claude-plugin/plugin.json': JSON.stringify({ version: '1.0.0' }),
    '.claude-plugin/marketplace.json': JSON.stringify({ plugins: [{ name: 'hold-your-voice', version: '1.0.0' }] }),
    'claude-plugin/.mcp.json': JSON.stringify({ mcpServers: { 'hold-your-voice': { args: ['--package=@holdyourvoice/hyv@1.0.0'] } } }),
    'Readme.md': '# public',
    LICENSE: [
      'Permission is hereby granted, free of charge, to any person obtaining a copy',
      'The above copyright notice and this permission notice shall be included in all',
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
    ].join('\n'),
    'src/version.ts': "export const HYV_VERSION = '1.0.0';",
    'src/stage1-evaluation.ts': "const baseline = '4e6269121d551c008a34db73077e1e4fea41b3f9'; const stage1 = '550ea24f652291dca13757fdbd2f0fa0b5e3f621';",
    ...Object.fromEntries(stage1Files.map((file) => [file, '{}'])),
  };
  for (const [file, text] of Object.entries({ ...defaults, ...files })) {
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  execFileSync('git', ['add', 'README.md'], { cwd: directory });
  return directory;
}

test('accepts the complete public package contract', () => {
  const directory = fixture({ 'README.md': '# public' });
  try {
    const result = spawnSync(process.execPath, [audit], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /release audit passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('requires exact Stage 1 scripts even when the checkpoint files remain', () => {
  const directory = fixture({
    'README.md': '# public',
    'package.json': JSON.stringify({ name: 'audit-fixture', license: 'MIT', files: ['dist', 'Readme.md', 'LICENSE'], scripts: { 'stage1:evaluate': 'node changed.mjs' }, version: '1.0.0', type: 'module', bin: { hyv: 'dist/cli.js' }, engines: { node: '>=20' } }),
  });
  try {
    const result = spawnSync(process.execPath, [audit], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Stage 1 script contract has drifted: stage1:evaluate/);
    assert.match(result.stderr, /Stage 1 script contract has drifted: stage1:dry-run/);
    assert.match(result.stderr, /Stage 1 script contract has drifted: stage1:human-packet/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects unquoted credentials in an untracked source file', () => {
  const directory = fixture({ 'README.md': '# public', 'src/unsafe.ts': ['const ', 'API_KEY', '=topsecret;'].join('') });
  try {
    const result = spawnSync(process.execPath, [audit], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /credential marker: src\/unsafe\.ts/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('requires the Claude extension version to match npm', () => {
  const directory = fixture({
    'README.md': '# public',
    'package.json': JSON.stringify({ name: 'audit-fixture', license: 'MIT', files: ['dist', 'Readme.md', 'LICENSE'], version: '1.0.0', type: 'module', bin: { hyv: 'dist/cli.js' }, engines: { node: '>=20' } }),
    'mcpb/manifest.json': JSON.stringify({ version: '1.0.1' }),
  });
  try {
    const result = spawnSync(process.execPath, [audit], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MCPB manifest version must match package\.json/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('requires every Claude package surface to match npm', () => {
  const directory = fixture({
    'README.md': '# public',
    'claude-plugin/.claude-plugin/plugin.json': JSON.stringify({ version: '0.9.0' }),
    '.claude-plugin/marketplace.json': JSON.stringify({ plugins: [{ name: 'other', version: '1.0.0' }, { name: 'hold-your-voice', version: '0.9.0' }] }),
    'claude-plugin/.mcp.json': JSON.stringify({ mcpServers: { 'hold-your-voice': { args: ['--package=@holdyourvoice/hyv@0.9.0'] } } }),
  });
  try {
    const result = spawnSync(process.execPath, [audit], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Claude plugin version must match package\.json/);
    assert.match(result.stderr, /Claude marketplace version must match package\.json/);
    assert.match(result.stderr, /Claude plugin package pin must match package\.json/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('requires the MCP runtime version to match npm', () => {
  const directory = fixture({ 'README.md': '# public', 'src/version.ts': "export const HYV_VERSION = '0.9.0';" });
  try {
    const result = spawnSync(process.execPath, [audit], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MCP runtime version must match package\.json/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('requires the npm package runtime contract', () => {
  const directory = fixture({
    'README.md': '# public',
    'package.json': JSON.stringify({
      name: 'audit-fixture',
      license: 'MIT',
      files: ['LICENSE'],
      version: '1.0.0',
      type: 'commonjs',
      bin: { hyv: 'src/cli.ts' },
      engines: { node: '>=18' },
    }),
  });
  try {
    const result = spawnSync(process.execPath, [audit], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /npm package must include dist/);
    assert.match(result.stderr, /npm package must include Readme\.md/);
    assert.match(result.stderr, /npm package must use the ESM runtime contract/);
    assert.match(result.stderr, /npm hyv binary must point to dist\/cli\.js/);
    assert.match(result.stderr, /npm package must require Node 20 or newer/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects every package manifest path outside the public allowlist', () => {
  const directory = fixture({
    'README.md': '# public',
    'package.json': JSON.stringify({
      name: 'audit-fixture',
      license: 'MIT',
      files: ['dist', 'Readme.md', 'LICENSE', 'docs', 'benchmarks/private', 'profiles'],
      version: '1.0.0',
      type: 'module',
      bin: { hyv: 'dist/cli.js' },
      engines: { node: '>=20' },
    }),
  });
  try {
    const result = spawnSync(process.execPath, [audit], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /npm package exposes an unexpected path: docs/);
    assert.match(result.stderr, /npm package exposes an unexpected path: benchmarks\/private/);
    assert.match(result.stderr, /npm package exposes an unexpected path: profiles/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects a forbidden nested file from the actual npm package list', () => {
  const directory = fixture({
    'README.md': '# public',
    'dist/profiles/private.json': '{"secret":true}',
  });
  try {
    const result = spawnSync(process.execPath, [audit], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /npm package contains an unexpected file: dist\/profiles\/private\.json/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

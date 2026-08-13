import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const audit = new URL('../scripts/release-audit.mjs', import.meta.url).pathname;

function fixture(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-audit-'));
  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  const defaults = {
    'package.json': JSON.stringify({ license: 'MIT', files: ['LICENSE'], version: '1.0.0' }),
    'mcpb/manifest.json': JSON.stringify({ version: '1.0.0' }),
    'claude-plugin/.claude-plugin/plugin.json': JSON.stringify({ version: '1.0.0' }),
    '.claude-plugin/marketplace.json': JSON.stringify({ plugins: [{ name: 'hold-your-voice', version: '1.0.0' }] }),
    'claude-plugin/.mcp.json': JSON.stringify({ mcpServers: { 'hold-your-voice': { args: ['--package=@holdyourvoice/hyv@1.0.0'] } } }),
    LICENSE: [
      'Permission is hereby granted, free of charge, to any person obtaining a copy',
      'The above copyright notice and this permission notice shall be included in all',
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
    ].join('\n'),
    'src/version.ts': "export const HYV_VERSION = '1.0.0';",
  };
  for (const [file, text] of Object.entries({ ...defaults, ...files })) {
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  execFileSync('git', ['add', 'README.md'], { cwd: directory });
  return directory;
}

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
    'package.json': JSON.stringify({ license: 'MIT', files: ['LICENSE'], version: '1.0.0' }),
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

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
    'package.json': JSON.stringify({ license: 'MIT', files: ['LICENSE'] }),
    LICENSE: [
      'Permission is hereby granted, free of charge, to any person obtaining a copy',
      'The above copyright notice and this permission notice shall be included in all',
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
    ].join('\n'),
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

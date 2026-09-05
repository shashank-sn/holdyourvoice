import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const mirrorScript = new URL('../scripts/mirror-refs.mjs', import.meta.url).pathname;

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function refs(repository: string) {
  const text = git(repository, 'for-each-ref', '--format=%(objectname)\t%(refname)', 'refs/heads', 'refs/tags');
  return text ? text.split('\n').sort() : [];
}

test('reconciles branch and tag creates, rewrites, and deletions', () => {
  const root = mkdtempSync(join(tmpdir(), 'hyv-mirror-refs-'));
  const source = join(root, 'source.git');
  const mirror = join(root, 'mirror.git');
  const checkout = join(root, 'checkout');

  try {
    git(root, 'init', '--bare', '--quiet', source);
    git(root, 'init', '--bare', '--quiet', mirror);
    git(root, 'clone', '--quiet', source, checkout);
    git(checkout, 'config', 'user.name', 'Mirror Test');
    git(checkout, 'config', 'user.email', 'mirror-test@example.invalid');
    git(checkout, 'switch', '--quiet', '-c', 'fixture/main');
    writeFileSync(join(checkout, 'main.txt'), 'first\n');
    git(checkout, 'add', 'main.txt');
    git(checkout, 'commit', '--quiet', '-m', 'first');
    git(checkout, 'switch', '--quiet', '-c', 'feature/test');
    writeFileSync(join(checkout, 'feature.txt'), 'feature\n');
    git(checkout, 'add', 'feature.txt');
    git(checkout, 'commit', '--quiet', '-m', 'feature');
    git(checkout, 'tag', 'v1.0.0');
    git(checkout, 'push', '--quiet', '--all', 'origin');
    git(checkout, 'push', '--quiet', '--tags', 'origin');
    git(source, 'symbolic-ref', 'HEAD', 'refs/heads/fixture/main');
    git(checkout, 'remote', 'set-head', 'origin', '-a');
    git(checkout, 'remote', 'add', 'mirror', mirror);

    execFileSync(process.execPath, [mirrorScript], { cwd: checkout, stdio: 'pipe' });
    assert.deepEqual(refs(mirror), refs(source));
    assert.equal(refs(mirror).some((ref) => ref.endsWith('refs/heads/HEAD')), false);

    git(checkout, 'switch', '--quiet', 'fixture/main');
    writeFileSync(join(checkout, 'main.txt'), 'rewritten\n');
    git(checkout, 'add', 'main.txt');
    git(checkout, 'commit', '--quiet', '--amend', '-m', 'rewritten main');
    git(checkout, 'branch', '-D', 'feature/test');
    git(checkout, 'tag', '-d', 'v1.0.0');
    git(checkout, 'tag', 'v2.0.0');
    git(checkout, 'push', '--quiet', '--force', 'origin', 'fixture/main');
    git(checkout, 'push', '--quiet', 'origin', '--delete', 'feature/test');
    git(checkout, 'push', '--quiet', 'origin', ':refs/tags/v1.0.0');
    git(checkout, 'push', '--quiet', 'origin', 'v2.0.0');

    execFileSync(process.execPath, [mirrorScript], { cwd: checkout, stdio: 'pipe' });
    assert.deepEqual(refs(mirror), refs(source));
    assert.equal(refs(mirror).some((ref) => ref.endsWith('refs/heads/feature/test')), false);
    assert.equal(refs(mirror).some((ref) => ref.endsWith('refs/tags/v1.0.0')), false);
    assert.equal(refs(mirror).some((ref) => ref.endsWith('refs/tags/v2.0.0')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

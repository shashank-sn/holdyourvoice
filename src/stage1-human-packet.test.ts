import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

function packetFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? packetFiles(path) : [path];
  });
}

test('Stage 1 human packet executes outside the repository and remains blocked without ratings', () => {
  const parent = mkdtempSync(join(tmpdir(), 'hyv-stage1-human-packet-test-'));
  const outputRoot = join(parent, 'packet');
  try {
    const output = JSON.parse(execFileSync(process.execPath, ['scripts/run-stage1-human-packet.mjs', '--out', outputRoot], { encoding: 'utf8' })) as {
      kind: string; writerEvidence: boolean; kitEmitted: boolean;
      decision: string; promotable: boolean; blockers: string[];
    };
    assert.equal(output.kind, 'hyv-stage1-operator-kit');
    assert.equal(output.writerEvidence, false);
    assert.equal(output.kitEmitted, true);
    assert.equal(output.decision, 'BLOCKED');
    assert.equal(output.promotable, false);
    assert.ok(output.blockers.includes('human_writer_evidence_deferred'));
    assert.ok(output.blockers.includes('locked_human_evidence_required'));
    assert.ok(output.blockers.includes('stage1_commit_uncheckoutable'));
    assert.ok(output.blockers.includes('receipts_unverified'));
    assert.equal(existsSync(join(outputRoot, 'ratings.ndjson')), false);
    for (const file of packetFiles(outputRoot)) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /"evidenceClass"\s*:\s*"human"/);
    }
    const status = JSON.parse(readFileSync(join(outputRoot, 'status.json'), 'utf8')) as {
      kind: string; writerEvidence: boolean; decision: string; promotable: boolean; blockers: string[];
    };
    assert.equal(status.kind, 'hyv-stage1-operator-kit');
    assert.equal(status.writerEvidence, false);
    assert.equal(status.decision, output.decision);
    assert.equal(status.promotable, output.promotable);
    assert.deepEqual(status.blockers, output.blockers);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('Stage 1 human packet reports locked commit checkoutability', () => {
  const parent = mkdtempSync(join(tmpdir(), 'hyv-stage1-human-identities-test-'));
  const outputRoot = join(parent, 'packet');
  try {
    execFileSync(process.execPath, ['scripts/run-stage1-human-packet.mjs', '--out', outputRoot], { stdio: 'pipe' });
    const identities = JSON.parse(readFileSync(join(outputRoot, 'IDENTITIES.json'), 'utf8')) as {
      baselineCheckoutable: boolean; stage1CommitCheckoutable: boolean;
      exactHeadBindingSatisfied: boolean; captureAuthorized: boolean;
    };
    assert.equal(identities.baselineCheckoutable, true);
    assert.equal(identities.stage1CommitCheckoutable, false);
    assert.equal(identities.exactHeadBindingSatisfied, false);
    assert.equal(identities.captureAuthorized, false);
    const operator = readFileSync(join(outputRoot, 'OPERATOR.md'), 'utf8');
    assert.match(operator, /Do not capture paired Stage 1 arm output until/);
    assert.match(operator, /verificationStatus: unverified/);
    const rating = JSON.parse(readFileSync(join(outputRoot, 'examples', 'rating.json'), 'utf8')) as { verificationStatus: string };
    assert.equal(rating.verificationStatus, 'unverified');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('Stage 1 human packet refuses a relative output path', () => {
  assert.throws(
    () => execFileSync(process.execPath, ['scripts/run-stage1-human-packet.mjs', '--out', 'stage1-human-output'], { stdio: 'pipe' }),
    /Human packet output must use an absolute path/,
  );
});

test('Stage 1 human packet refuses repository output', () => {
  assert.throws(
    () => execFileSync(process.execPath, ['scripts/run-stage1-human-packet.mjs', '--out', join(process.cwd(), 'stage1-human-output')], { stdio: 'pipe' }),
    /Human packet output must stay outside the repository and every worktree/,
  );
});

test('Stage 1 human packet refuses every linked worktree and the primary clone', () => {
  const porcelain = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  const trees = porcelain.split('\n').flatMap((line) => (line.startsWith('worktree ') ? [realpathSync(line.slice('worktree '.length))] : []));
  const gitCommonDir = realpathSync(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim());
  trees.push(dirname(gitCommonDir));
  for (const root of new Set(trees)) {
    assert.throws(
      () => execFileSync(process.execPath, ['scripts/run-stage1-human-packet.mjs', '--out', join(root, 'stage1-human-output')], { stdio: 'pipe' }),
      /Human packet output must stay outside the repository and every worktree/,
    );
  }
});

test('Stage 1 human packet refuses a symlinked ancestor into the repository', () => {
  const parent = mkdtempSync(join(tmpdir(), 'hyv-stage1-human-symlink-test-'));
  const repositoryTarget = join(process.cwd(), 'stage1-human-symlink-target');
  mkdirSync(repositoryTarget);
  symlinkSync(repositoryTarget, join(parent, 'redirect'));
  try {
    assert.throws(
      () => execFileSync(process.execPath, ['scripts/run-stage1-human-packet.mjs', '--out', join(parent, 'redirect', 'packet')], { stdio: 'pipe' }),
      /Human packet output must stay outside the repository and every worktree/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(repositoryTarget, { recursive: true, force: true });
  }
});

test('Stage 1 human packet refuses fabricated human ratings', () => {
  assert.throws(
    () => execFileSync(process.execPath, ['scripts/run-stage1-human-packet.mjs', '--fabricate-human-ratings'], { stdio: 'pipe' }),
    /Human evidence cannot be fabricated/,
  );
});

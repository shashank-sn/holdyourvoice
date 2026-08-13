import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('synthetic Stage 1 packet executes outside the repository and remains blocked', () => {
  const parent = mkdtempSync(join(tmpdir(), 'hyv-stage1-dry-run-test-'));
  const outputRoot = join(parent, 'packet');
  try {
    const output = JSON.parse(execFileSync(process.execPath, ['scripts/run-stage1-dry-run.mjs', '--out', outputRoot], { encoding: 'utf8' })) as {
      decision: string; promotable: boolean; blockers: string[];
    };
    assert.equal(output.decision, 'BLOCKED');
    assert.equal(output.promotable, false);
    assert.deepEqual(output.blockers, ['human_writer_evidence_deferred', 'synthetic_fixture_evidence', 'locked_human_evidence_required']);
    const report = JSON.parse(readFileSync(join(outputRoot, 'report.json'), 'utf8')) as { decision: string; promotable: boolean; reportDigest: string };
    assert.equal(report.decision, 'BLOCKED');
    assert.equal(report.promotable, false);
    assert.match(report.reportDigest, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('synthetic Stage 1 packet refuses repository output', () => {
  assert.throws(
    () => execFileSync(process.execPath, ['scripts/run-stage1-dry-run.mjs', '--out', join(process.cwd(), 'stage1-output')], { stdio: 'pipe' }),
    /Dry-run output must stay outside the repository/,
  );
});

test('synthetic Stage 1 packet refuses a symlinked ancestor into the repository', () => {
  const parent = mkdtempSync(join(tmpdir(), 'hyv-stage1-symlink-test-'));
  const repositoryTarget = join(process.cwd(), 'stage1-symlink-target');
  mkdirSync(repositoryTarget);
  symlinkSync(repositoryTarget, join(parent, 'redirect'));
  try {
    assert.throws(
      () => execFileSync(process.execPath, ['scripts/run-stage1-dry-run.mjs', '--out', join(parent, 'redirect', 'packet')], { stdio: 'pipe' }),
      /Dry-run output must stay outside the repository/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(repositoryTarget, { recursive: true, force: true });
  }
});

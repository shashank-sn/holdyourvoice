import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const cli = new URL('./cli.js', import.meta.url).pathname;

function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('creates an explicit local avoid list and exposes the ruleset', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const first = join(directory, 'first.md');
    const second = join(directory, 'second.md');
    const profile = join(directory, 'profile.json');
    writeFileSync(first, 'i write plainly. i name the work.');
    writeFileSync(second, 'i keep the mechanism clear. i avoid filler.');
    const created = run('profile', profile, first, second, '--avoid=unlock');
    assert.equal(created.status, 0, created.stderr);
    assert.deepEqual(JSON.parse(readFileSync(profile, 'utf8')).avoid, ['unlock']);

    const patterns = run('patterns');
    assert.equal(patterns.status, 0, patterns.stderr);
    assert.ok(JSON.parse(patterns.stdout).rules.every((rule: { id: string; severity: string; reason: string; suggestion: string }) => rule.id && rule.severity && rule.reason && rule.suggestion));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('uses exit code 2 for a failed candidate gate and 1 for misuse', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const first = join(directory, 'first.md');
    const second = join(directory, 'second.md');
    const profile = join(directory, 'profile.json');
    const original = join(directory, 'original.md');
    const candidate = join(directory, 'candidate.md');
    writeFileSync(first, 'i write plainly. i name the work.');
    writeFileSync(second, 'i keep the mechanism clear. i avoid filler.');
    writeFileSync(original, 'i name the work.');
    writeFileSync(candidate, 'i unlock the answer.');
    assert.equal(run('profile', profile, first, second, '--avoid=unlock').status, 0);
    const verification = run('verify', original, candidate, profile);
    assert.equal(verification.status, 2);
    assert.deepEqual(Object.keys(JSON.parse(verification.stdout)).sort(), ['candidate', 'original', 'passed', 'preservationScore', 'regressions', 'version']);
    assert.equal(run('unknown-command').status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects a malformed hand-edited profile before analysis', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const draft = join(directory, 'draft.md');
    const profile = join(directory, 'profile.json');
    writeFileSync(draft, 'i name the work.');
    writeFileSync(profile, JSON.stringify({ version: '2', sampleCount: 2, metrics: {}, avoid: [1] }));
    const result = run('analyze', draft, profile);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a valid Hold Your Voice version 2 profile/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects malformed profile enum values and punctuation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const draft = join(directory, 'draft.md');
    const profile = join(directory, 'profile.json');
    writeFileSync(draft, 'i name the work.');
    writeFileSync(profile, JSON.stringify({
      version: '2',
      sampleCount: 2,
      metrics: {
        sentenceLength: 4,
        sentenceVariation: 1,
        sentenceStructure: [],
        rhythm: 1,
        paragraphLength: 1,
        openingMoves: [],
        vocabulary: [],
        lexicalDensity: 0.5,
        pointOfView: 'fourth_person',
        punctuation: [],
        caseStyle: 'titlecase',
        questionRate: 0,
        transitions: [],
      },
      avoid: [''],
    }));
    assert.equal(run('analyze', draft, profile).status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects hand-edited metrics outside their semantic bounds', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const first = join(directory, 'first.md');
    const second = join(directory, 'second.md');
    const profile = join(directory, 'profile.json');
    const draft = join(directory, 'draft.md');
    writeFileSync(first, 'i write plainly.');
    writeFileSync(second, 'i name the work.');
    writeFileSync(draft, 'i name the work.');
    assert.equal(run('profile', profile, first, second).status, 0);
    const malformed = JSON.parse(readFileSync(profile, 'utf8'));
    malformed.sampleCount = 2.5;
    malformed.metrics.questionRate = 1.2;
    writeFileSync(profile, JSON.stringify(malformed));
    assert.equal(run('analyze', draft, profile).status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

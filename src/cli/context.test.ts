import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildProfile } from '../voice-dna.js';

test('prepare-rewrite recognizes contexts in either order and rejects duplicates before writing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyv-cli-context-'));
  try {
    const draft = join(directory, 'draft.md');
    const profile = join(directory, 'profile.json');
    const task = join(directory, 'task.json');
    const spec = join(directory, 'spec.json');
    const brief = join(directory, 'brief.json');
    const ambiguous = join(directory, 'ambiguous.json');
    const invalid = join(directory, 'invalid.json');
    const copySpec = { version: '1', audience: 'writers', intent: 'explain', channel: 'general', claims: [{ id: 'mechanism', text: 'I keep the mechanism clear.', evidence: 'The source draft.' }] };
    const writingBrief = { version: '1', audience: 'writers', intent: 'explain', format: 'general' };
    writeFileSync(draft, 'I keep the mechanism clear.');
    writeFileSync(profile, JSON.stringify(buildProfile(['I write plainly. I name the work.', 'I keep the mechanism clear. I avoid filler.'])));
    writeFileSync(spec, JSON.stringify(copySpec));
    writeFileSync(brief, JSON.stringify(writingBrief));
    writeFileSync(ambiguous, JSON.stringify({ ...copySpec, ...writingBrief }));
    writeFileSync(invalid, '{}');
    const run = (contexts: string[]) => spawnSync(process.execPath, [new URL('../cli.js', import.meta.url).pathname, 'prepare-rewrite', draft, profile, task, ...contexts], { encoding: 'utf8' });

    for (const contexts of [[spec, brief], [brief, spec]]) {
      const result = run(contexts);
      assert.equal(result.status, 0, result.stderr);
      const prepared = JSON.parse(readFileSync(task, 'utf8'));
      assert.deepEqual(prepared.copySpec, copySpec);
      assert.deepEqual(prepared.writingBrief, writingBrief);
    }
    const result = run([ambiguous]);
    assert.equal(result.status, 0, result.stderr);
    const prepared = JSON.parse(readFileSync(task, 'utf8'));
    assert.deepEqual(prepared.copySpec, { ...copySpec, ...writingBrief });
    assert.equal(prepared.writingBrief, undefined);

    for (const [contexts, error] of [
      [[spec, spec], 'Prepare-rewrite accepts at most one CopySpec.'],
      [[brief, brief], 'Prepare-rewrite accepts at most one WritingBrief.'],
      [[invalid], `Expected a valid CopySpec or WritingBrief at ${invalid}.`],
    ] as const) {
      const before = readFileSync(task, 'utf8');
      const rejected = run([...contexts]);
      assert.equal(rejected.status, 1);
      assert.equal(rejected.stdout, '');
      assert.equal(rejected.stderr, `${error}\n`);
      assert.equal(readFileSync(task, 'utf8'), before);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

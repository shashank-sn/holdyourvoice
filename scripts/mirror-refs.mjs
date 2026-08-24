import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const headsRefspec = '+refs/remotes/origin/*:refs/heads/*';
const tagsRefspec = '+refs/tags/*:refs/tags/*';

function output(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'inherit' });
}

function refLines(text) {
  return text.trim() ? text.trim().split('\n').sort() : [];
}

function sourceRefs(cwd) {
  return refLines(output(cwd, ['for-each-ref', '--format=%(objectname)\t%(refname)', 'refs/remotes/origin', 'refs/tags']))
    .map((line) => line.replace('\trefs/remotes/origin/', '\trefs/heads/'))
    .sort();
}

function mirroredRefs(cwd) {
  return refLines(output(cwd, ['ls-remote', '--refs', 'mirror', 'refs/heads/*', 'refs/tags/*']));
}

function parityError(source, mirror) {
  const sourceSet = new Set(source);
  const mirrorSet = new Set(mirror);
  const missing = source.filter((ref) => !mirrorSet.has(ref));
  const unexpected = mirror.filter((ref) => !sourceSet.has(ref));
  return new Error([
    'Source and mirror refs differ after push.',
    ...missing.map((ref) => `missing: ${ref}`),
    ...unexpected.map((ref) => `unexpected: ${ref}`),
  ].join('\n'));
}

async function pushWithRetry(cwd, attempts, delayMs) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawnSync('git', ['push', '--prune', 'mirror', headsRefspec, tagsRefspec], { cwd, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status === 0) return;
    if (attempt === attempts) throw new Error(`Mirror push failed after ${attempts} attempts.`);
    await new Promise((done) => setTimeout(done, delayMs * attempt));
  }
}

export async function reconcileMirror({ cwd = process.cwd(), attempts = 3, delayMs = 5_000 } = {}) {
  run(cwd, ['fetch', '--prune', '--prune-tags', 'origin', '+refs/heads/*:refs/remotes/origin/*', tagsRefspec]);
  run(cwd, ['update-ref', '--no-deref', '-d', 'refs/remotes/origin/HEAD']);
  await pushWithRetry(cwd, attempts, delayMs);

  const source = sourceRefs(cwd);
  const mirror = mirroredRefs(cwd);
  if (source.length !== mirror.length || source.some((ref, index) => ref !== mirror[index])) {
    throw parityError(source, mirror);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await reconcileMirror();
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

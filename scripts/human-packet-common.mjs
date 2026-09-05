import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  BASELINE_COMMIT,
  STAGE1_COMMIT,
} from '../dist/stage1-evaluation.js';

export { BASELINE_COMMIT, STAGE1_COMMIT };

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing --${name}.`);
  return process.argv[index + 1];
}

function writeJson(root, name, value) {
  writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function checkoutable(repositoryRoot, commit) {
  try {
    execFileSync('git', ['cat-file', '-t', commit], { cwd: repositoryRoot, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function prepareHumanPacket() {
  if (process.argv.includes('--fabricate-human-ratings')) {
    throw new Error('Human evidence cannot be fabricated.');
  }

  const repositoryRoot = realpathSync(resolve(dirname(new URL(import.meta.url).pathname), '..'));
  const outputOption = option('out');
  if (!isAbsolute(outputOption)) throw new Error('Human packet output must use an absolute path.');
  const outputRoot = resolve(outputOption);
  const outputParent = realpathSync(dirname(outputRoot));
  const resolvedOutputRoot = join(outputParent, basename(outputRoot));
  const repositoryTrees = new Set([repositoryRoot]);
  const porcelain = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) repositoryTrees.add(realpathSync(line.slice('worktree '.length)));
  }
  function outsideRepository(path) {
    for (const root of repositoryTrees) {
      const relativeOutput = relative(root, path);
      if (!(relativeOutput === '..' || relativeOutput.startsWith(`..${sep}`))) return false;
    }
    return true;
  }
  if (!outsideRepository(resolvedOutputRoot)) {
    throw new Error('Human packet output must stay outside the repository and every worktree.');
  }

  const mergedHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const baselineCheckoutable = checkoutable(repositoryRoot, BASELINE_COMMIT);
  const stage1CommitCheckoutable = checkoutable(repositoryRoot, STAGE1_COMMIT);

  function writePacket({ identities, operator, commands, protocolSkeleton, templates, status }) {
    mkdirSync(outputRoot, { recursive: false, mode: 0o700 });
    if (!outsideRepository(realpathSync(outputRoot))) {
      throw new Error('Human packet output must stay outside the repository and every worktree.');
    }
    const examplesRoot = join(outputRoot, 'examples');
    mkdirSync(examplesRoot, { recursive: false, mode: 0o700 });
    writeJson(outputRoot, 'IDENTITIES.json', identities);
    writeFileSync(join(outputRoot, 'OPERATOR.md'), operator, { flag: 'wx' });
    writeFileSync(join(outputRoot, 'COMMANDS.sh'), commands, { flag: 'wx', mode: 0o700 });
    writeJson(outputRoot, 'protocol-skeleton.json', protocolSkeleton);
    writeJson(examplesRoot, 'roster.json', { verificationStatus: 'unverified', reviewers: [] });
    writeJson(examplesRoot, 'rights-manifest.json', { verificationStatus: 'unverified', cases: [] });
    writeJson(examplesRoot, 'trust-keys.json', { verificationStatus: 'unverified', keys: [] });
    writeJson(examplesRoot, 'mapping.json', { verificationStatus: 'unverified' });
    writeJson(examplesRoot, 'rating.json', { verificationStatus: 'unverified' });
    writeFileSync(join(examplesRoot, 'TEMPLATES.md'), templates, { flag: 'wx' });
    writeJson(outputRoot, 'status.json', status);
    process.stdout.write(`${JSON.stringify({ ...status, outputRoot })}\n`);
  }

  return { mergedHead, baselineCheckoutable, stage1CommitCheckoutable, writePacket };
}

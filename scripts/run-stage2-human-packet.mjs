#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  BASELINE_COMMIT,
  STAGE1_COMMIT,
} from '../dist/stage1-evaluation.js';

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing --${name}.`);
  return process.argv[index + 1];
}

function writeJson(root, name, value) {
  writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function checkoutable(commit) {
  try {
    execFileSync('git', ['cat-file', '-t', commit], { cwd: repositoryRoot, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

if (process.argv.includes('--fabricate-human-ratings')) {
  throw new Error('Human evidence cannot be fabricated.');
}

const repositoryRoot = realpathSync(resolve(dirname(new URL(import.meta.url).pathname), '..'));
const outputOption = option('out');
if (!isAbsolute(outputOption)) throw new Error('Human packet output must use an absolute path.');
const outputRoot = resolve(outputOption);
const outputParent = realpathSync(dirname(outputRoot));
const resolvedOutputRoot = join(outputParent, basename(outputRoot));
const repositoryTrees = (() => {
  const trees = new Set([repositoryRoot]);
  const porcelain = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) trees.add(realpathSync(line.slice('worktree '.length)));
  }
  return trees;
})();
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
const baselineCheckoutable = checkoutable(BASELINE_COMMIT);
const stage1CommitCheckoutable = checkoutable(STAGE1_COMMIT);
const identities = {
  baselineCommit: BASELINE_COMMIT,
  stage1Commit: STAGE1_COMMIT,
  advancedEditMergedCommit: '1ffaabe2586adf11a2ed6db4dba8d1d88095f507',
  rebuildCommit: null,
  mergedHead,
  baselineCheckoutable,
  stage1CommitCheckoutable,
  captureAuthorized: false,
  lockedHumanProtocolDigest: null,
};
const blockers = [
  'stage2_adoption_evidence_deferred',
  'human_writer_evidence_deferred',
  'locked_human_evidence_required',
  'stage1_checkpoint_unpassed',
  ...(stage1CommitCheckoutable ? [] : ['stage1_commit_uncheckoutable']),
  'reviewer_roster_verification_deferred',
  'receipts_unverified',
  'rebuild_release_claim_blocked',
];
const status = {
  kind: 'hyv-stage2-operator-kit',
  writerEvidence: false,
  kitEmitted: true,
  decision: 'BLOCKED',
  promotable: false,
  blockers,
  lockedHumanProtocolDigest: null,
  stage1CommitCheckoutable,
  captureAuthorized: false,
  receiptsUnverified: true,
  approvedEncryptedStorage: false,
};
const protocolSkeleton = {
  kind: 'hyv-stage2-preregistration',
  version: '1',
  mode: 'locked-human',
  baseline: { packageVersion: '3.2.0', sourceCommit: BASELINE_COMMIT },
  stage1: { sourceCommit: STAGE1_COMMIT },
  advancedEdit: { sourceCommit: '1ffaabe2586adf11a2ed6db4dba8d1d88095f507' },
  rebuild: { sourceCommit: null },
  benchmark: { manifestDigest: null, partitionDigest: null, partition: 'locked-test', synthetic: false },
  cases: [],
  intentToTreat: { expectedAssignments: null, expectedReviewers: null },
  execution: {
    provider: null,
    model: null,
    modelRevision: null,
    settingsDigest: null,
    taskContractDigest: null,
    rulesetDigest: null,
    rubricDigest: null,
  },
  randomization: { algorithm: 'sha256-counter-v1', commitment: null },
  reviewerRosterDigest: null,
  analysis: {
    statistic: 'paired-preference-rate',
    decisionRule: 'workflow-non-regression-plus-one-advanced-judgment',
    margin: null,
    minimumCases: null,
    minimumRatings: null,
    missingRatingPolicy: 'count-as-non-preference',
    tiePolicy: 'count-as-half',
    retryPolicy: 'no-retry',
    routingPolicy: 'precommitted-blind-routing',
  },
  rights: {
    providerDisclosureDigest: null,
    reviewerDisclosureDigest: null,
    derivedRetentionDigest: null,
  },
  releaseAuditContractDigest: null,
  registeredAt: null,
  measures: [
    'writer_preference',
    'correction_versus_confirm',
    'workflow_completion',
    'workflow_abandonment',
    'argument_false_accept',
    'form_false_accept',
    'flatness_false_accept',
    'polarity_false_accept',
    'semantic_false_accept',
    'provider_call_count',
    'human_decision_count',
  ],
  gates: ['semantic', 'copy_spec', 'hygiene', 'preservation', 'cli_mcp_parity', 'backward_compatibility'],
};
const operator = `# Stage 2 human-study operator packet

This packet is preparation material only. It is BLOCKED and cannot establish MAR-364 promotion evidence. \`status.json\` is an operator-kit record, not an evaluator report. This kit never sets \`captureAuthorized\` true. Kit output under \`--out\` is not approved encrypted custody.

## Separate reports

Compare unchanged Hyv 3.2.0, Stage 1, advanced edit, and rebuild as four separate reports. Do not merge edit and rebuild into one preservation claim. Stage 1 remains unpassed; this kit cannot promote MAR-364 or authorize a versioned release.

## Rights and provenance

Use only a non-synthetic corpus with documented rights, per-case provenance, provider and reviewer disclosure permission, approved encrypted storage, retention expiry, deletion procedure, and incident owner. Keep writer text and provider outputs outside every repository and worktree.

## Reviewer roster and trust keys

Pre-register the complete reviewer roster and expected reviewer count. Each reviewer must be a real human writer. Populate the external trust store before review; HYV does not create reviewer IDs, keys, signatures, or attestations.

## Blind packet

After validating the complete intent-to-treat run set, the mapping custodian creates the concealed A/B mapping. Failed hard-gate pairs remain in the denominator and are listed as non-reviewable. Store blind contents encrypted at rest in approved storage.

## Human review

Each rostered reviewer rates every reviewable case once. Record workflow completion, abandonment, correction burden, and blind preference. Record false-accept and false-escalation for argument, form, flatness, polarity, and semantic judgments. Count provider calls and human decisions per approved draft. Missing ratings count as non-preference.

## External verification

Treat every imported human record as \`verificationStatus: unverified\` until an external verifier is configured. Agent scores, \`hyv_score\`, and model ratings are not writer evidence.

## Finish or stop

While \`stage2_adoption_evidence_deferred\` is forced, the result remains BLOCKED. Record only STOP or REPEAT_PROTOCOL with an external checkpoint receipt. Never fabricate missing evidence. Never record PROCEED_TO_MAR_365. Do not publish an npm release that claims writer checkpoints passed.
`;
const commands = `#!/bin/sh
npm run stage2:human-packet -- --out /absolute/path/outside-the-repository/stage2-human-packet
`;
const templates = `# Empty evidence slots

These JSON files are deliberately incomplete and must not be submitted as writer evidence.

- roster.json: add the approved human reviewer roster and expected reviewer count.
- rights-manifest.json: add corpus-level custody records without copying private prose here.
- trust-keys.json: add externally managed reviewer and custodian public keys.
- mapping.json: the mapping custodian fills this after protocol commitment.
- rating.json: a rostered human reviewer fills and externally signs this after blind review.
`;

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

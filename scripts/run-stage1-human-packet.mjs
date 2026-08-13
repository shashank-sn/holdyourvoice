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
  mergedHead,
  baselineCheckoutable,
  stage1CommitCheckoutable,
  exactHeadBindingSatisfied: stage1CommitCheckoutable,
  captureAuthorized: false,
  lockedHumanProtocolDigest: null,
};
const blockers = [
  'human_writer_evidence_deferred',
  'locked_human_evidence_required',
  ...(stage1CommitCheckoutable ? [] : ['stage1_commit_uncheckoutable']),
  'reviewer_roster_verification_deferred',
  'receipts_unverified',
];
const status = {
  kind: 'hyv-stage1-operator-kit',
  writerEvidence: false,
  kitEmitted: true,
  decision: 'BLOCKED',
  promotable: false,
  blockers,
  lockedHumanProtocolDigest: null,
  stage1CommitCheckoutable,
  exactHeadBindingSatisfied: stage1CommitCheckoutable,
  captureAuthorized: false,
  receiptsUnverified: true,
  approvedEncryptedStorage: false,
};
const protocolSkeleton = {
  kind: 'hyv-stage1-preregistration',
  version: '1',
  mode: 'locked-human',
  baseline: { packageVersion: '3.2.0', sourceCommit: BASELINE_COMMIT },
  stage1: { sourceCommit: STAGE1_COMMIT },
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
    decisionRule: 'preference-or-correction-with-workflow-non-regression',
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
  measures: ['writer_preference', 'correction_versus_confirm', 'workflow_completion', 'workflow_abandonment'],
  gates: ['semantic', 'copy_spec', 'hygiene', 'preservation', 'cli_mcp_parity', 'backward_compatibility'],
};
const operator = `# Stage 1 human-study operator packet

This packet is preparation material only. It is BLOCKED and cannot establish MAR-362 promotion evidence. \`status.json\` is an operator-kit record, not an evaluator report. This kit never sets \`captureAuthorized\` true; checkoutability of \`STAGE1_COMMIT\` is necessary but not sufficient. Kit output under \`--out\` is not approved encrypted custody; \`/tmp\` and other ordinary directories are emit-only.

## Exact-head binding

Do not capture paired Stage 1 arm output until \`STAGE1_COMMIT\` is checkoutable. The merged HEAD squash is not that locked tree. Do not label HEAD bytes as \`stage1.sourceCommit\`. Protocol identity stays \`550ea24f652291dca13757fdbd2f0fa0b5e3f621\`. Baseline capture may use checkoutable \`4e6269121d551c008a34db73077e1e4fea41b3f9\`. While \`stage1CommitCheckoutable\` is false, capture remains unauthorized.

## Rights and provenance

Use only a non-synthetic corpus with documented rights, per-case provenance, provider and reviewer disclosure permission, approved encrypted storage, retention expiry, deletion procedure, and incident owner. Keep writer text and provider outputs outside every repository and worktree. Fill the rights manifest and bind its digests into each case before committing the protocol. Validate the private lane with the approved encrypted root; do not treat kit emission as that root.

## Reviewer roster and trust keys

Pre-register the complete reviewer roster and expected reviewer count. Each reviewer must be a real human writer represented by an externally managed identity and signing key. Populate the external trust store before review; HYV does not create reviewer IDs, keys, signatures, or attestations. The mapping custodian must be distinct from every reviewer, and reviewers must not have unblinding access.

## Provider capture

HYV never calls a provider. For every pre-registered assignment, the operator runs the CLI lifecycle locally: use prepare-rewrite to create the task, explicitly forward that task to the declared provider, capture the response, use apply-rewrite, and complete the lifecycle review or escalation. Preserve immutable provider, model revision, settings, timing, token, cost, outcome, and digest records without storing source prose in exported evidence.

## Blind packet

After validating the complete intent-to-treat run set, the mapping custodian creates the concealed A/B mapping and runs freeze-blind. Failed hard-gate pairs remain in the denominator and are listed as non-reviewable. freezeBlind checks bindings and label leakage; it does not encrypt contents. Store blind contents encrypted at rest in approved storage and keep the mapping concealed until ratings are sealed.

## Human review

Each rostered reviewer rates every reviewable case once. A completed review records blind preference plus correction-versus-confirm for both A and B. An abandoned review records workflow abandonment and no preference or correction fields. Missing ratings count as non-preference. The complete reviewer-by-case matrix is required; an incomplete matrix fails with reviewer_matrix_mismatch.

The protocol uses intent-to-treat and no retry. Every pre-registered assignment stays in the denominator. Timeouts, errors, and hard-gate failures are not retried; hard-gate failures count as failures and remain non-reviewable for pairwise preference.

## External verification

External verification receipts are required for human review, mapping custody, and checkpoint disposition. The runtime validates receipt shape and artifact/protocol/packet binding only; it does not cryptographically verify signatures, roster membership, or trust chains. Treat every imported human record as \`verificationStatus: unverified\` until an external verifier is configured. Use only these purposes: stage1-blind-review, stage1-mapping-custody, and stage1-checkpoint-disposition. Agent scores, \`hyv_score\`, and model ratings are not writer evidence.

## Finish or stop

Seal ratings only after the complete matrix is captured, then reduce against the bound release audit. While human_writer_evidence_deferred is forced, the result remains BLOCKED. Record only STOP or REPEAT_PROTOCOL with an external checkpoint receipt. Never fabricate missing evidence, retry failed assignments, or record PROCEED_TO_MAR_363.
`;
const commands = `#!/bin/sh
npm run stage1:evaluate -- commit-protocol --protocol <uncommitted-protocol.json>
npm run stage1:evaluate -- preflight --protocol <protocol.json>
npm run stage1:evaluate -- validate-runs --protocol <protocol.json> --runs <runs.ndjson-or-json>
npm run stage1:evaluate -- freeze-blind --protocol <protocol.json> --runs <runs> --mapping <mapping.json> --contents <encrypted-contents.json> --non-reviewable <failed-pairs.json>
npm run stage1:evaluate -- record-rating --packet <packet.json> --ratings <ratings.ndjson> --rating <signed-rating.json>
npm run stage1:evaluate -- seal-ratings --packet <packet.json> --mapping <mapping.json> --ratings <ratings.ndjson>
npm run stage1:evaluate -- reduce --protocol <protocol.json> --runs <runs> --packet <packet.json> --mapping <mapping.json> --ratings <ratings.ndjson> --seal <seal.json> --release-audit <audit.json>
npm run stage1:evaluate -- record-checkpoint-disposition --report <report.json> --disposition <STOP|REPEAT_PROTOCOL> --attestation <external-receipt.json>
`;
const templates = `# Empty evidence slots

These JSON files are deliberately incomplete and must not be submitted to the evaluator as written.

- roster.json: add the approved human reviewer roster and expected reviewer count, then compute its canonical digest.
- rights-manifest.json: add corpus-level custody and per-case rights and provenance records without copying private prose here.
- trust-keys.json: add externally managed reviewer and custodian public keys. Do not claim verification until an external verifier has produced a bound receipt.
- mapping.json: the mapping custodian fills this after protocol commitment. The custodian must not be a reviewer.
- rating.json: a rostered human reviewer fills and externally signs this after blind review. Automation must not fill identity, preference, workflow, or attestation fields.
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

#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import {
  BASELINE_COMMIT,
  STAGE1_COMMIT,
  commitProtocol,
  freezeBlind,
  recordRating,
  reduceEvaluation,
  sealRatings,
  sha256Canonical,
} from '../dist/stage1-evaluation.js';

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing --${name}.`);
  return process.argv[index + 1];
}

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writeJson(root, name, value) {
  writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

const repositoryRoot = realpathSync(resolve(dirname(new URL(import.meta.url).pathname), '..'));
const outputRoot = resolve(option('out'));
const outputParent = realpathSync(dirname(outputRoot));
const resolvedOutputRoot = join(outputParent, basename(outputRoot));
function outsideRepository(path) {
  const relativeOutput = relative(repositoryRoot, path);
  return relativeOutput === '..' || relativeOutput.startsWith(`..${sep}`);
}
if (!outsideRepository(resolvedOutputRoot)) {
  throw new Error('Dry-run output must stay outside the repository.');
}

const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'benchmarks/manifest.json'), 'utf8'));
const calibration = manifest.partitions.find((partition) => partition.id === 'calibration');
const caseEntry = calibration.cases[0];
const fixture = JSON.parse(readFileSync(join(repositoryRoot, 'benchmarks', caseEntry.file), 'utf8'));
const digest = (value) => sha256Canonical(value);
const releaseAuditContractDigest = digest({ command: 'npm run check:release', version: '1', candidateCommit: STAGE1_COMMIT });
const provenanceDigest = digest({ provenance: fixture.provenance, sourceType: 'synthetic-public' });
const providerDisclosureDigest = digest({ disclosure: 'none' });
const reviewerDisclosureDigest = digest({ disclosure: 'synthetic-only' });
const derivedRetentionDigest = digest({ retention: 'operator-chosen-output-root' });
const rightsDigest = digest({ caseId: fixture.id, caseDigest: caseEntry.sha256, provenanceDigest, providerDisclosureDigest, reviewerDisclosureDigest, derivedRetentionDigest });
const reviewerRosterDigest = digest({ reviewers: ['synthetic-dry-run'] });
const randomizationNonce = 'c3ludGhldGljLWRyeS1ydW4tbm9uY2U';
const labels = { A: 'stage1', B: 'baseline' };

const protocol = commitProtocol({
  kind: 'hyv-stage1-preregistration', version: '1', mode: 'development-calibration',
  baseline: { packageVersion: '3.2.0', sourceCommit: BASELINE_COMMIT },
  stage1: { sourceCommit: STAGE1_COMMIT },
  benchmark: { manifestDigest: digest(manifest), partitionDigest: calibration.sha256, partition: 'calibration', synthetic: true },
  cases: [{ caseId: fixture.id, caseDigest: caseEntry.sha256, provenanceDigest, rightsDigest, providerDisclosureDigest, reviewerDisclosureDigest, derivedRetentionDigest }],
  intentToTreat: { expectedAssignments: 2, expectedReviewers: 1 },
  execution: {
    provider: 'provider-neutral-dry-run', model: 'no-provider-call', modelRevision: 'none',
    settingsDigest: digest({ providerCall: false }), taskContractDigest: digest({ task: 'synthetic-calibration-v1' }),
    rulesetDigest: manifest.baseline.serializedRulesSha256, rubricDigest: digest({ rubric: 'stage1-dry-run-v1' }),
  },
  randomization: { algorithm: 'sha256-counter-v1', commitment: digest({ algorithm: 'sha256-counter-v1', nonce: randomizationNonce, labels }) },
  reviewerRosterDigest,
  analysis: {
    statistic: 'paired-preference-rate', decisionRule: 'preference-or-correction-with-workflow-non-regression', margin: 0,
    minimumCases: 1, minimumRatings: 1, missingRatingPolicy: 'count-as-non-preference',
    tiePolicy: 'count-as-half', retryPolicy: 'no-retry', routingPolicy: 'precommitted-blind-routing',
  },
  rights: {
    providerDisclosureDigest, reviewerDisclosureDigest, derivedRetentionDigest,
  },
  releaseAuditContractDigest, registeredAt: '2026-08-13T00:00:00.000Z',
  measures: ['writer_preference', 'correction_versus_confirm', 'workflow_completion', 'workflow_abandonment'],
  gates: ['semantic', 'copy_spec', 'hygiene', 'preservation', 'cli_mcp_parity', 'backward_compatibility'],
});

const candidateDigest = digest({ baseline: protocol.baseline, stage1: protocol.stage1 });
const candidates = { A: fixture.draft, B: fixture.draft };
const gates = { semantic: true, copySpec: true, hygiene: true, preservation: true, cliMcpParity: true, backwardCompatibility: true };
const runs = [
  { kind: 'hyv-stage1-run-record', version: '1', evidenceClass: 'synthetic-dry-run', protocolDigest: protocol.protocolDigest, candidateDigest, assignmentId: 'dry-baseline-1', participantId: 'synthetic-operator', caseId: fixture.id, caseDigest: caseEntry.sha256, rightsDigest, arm: 'baseline', ordinal: 1, latencyMs: 0, inputTokens: 0, outputTokens: 0, costMicrousd: 0, occurredAt: '2026-08-13T00:00:01.000Z', outcome: 'completed', outputDigest: sha256Text(candidates.B), hardGates: gates },
  { kind: 'hyv-stage1-run-record', version: '1', evidenceClass: 'synthetic-dry-run', protocolDigest: protocol.protocolDigest, candidateDigest, assignmentId: 'dry-stage1-1', participantId: 'synthetic-operator', caseId: fixture.id, caseDigest: caseEntry.sha256, rightsDigest, arm: 'stage1', ordinal: 2, latencyMs: 0, inputTokens: 0, outputTokens: 0, costMicrousd: 0, occurredAt: '2026-08-13T00:00:02.000Z', outcome: 'completed', outputDigest: sha256Text(candidates.A), hardGates: gates },
];
const mapping = { kind: 'hyv-stage1-blind-mapping', version: '1', nonce: randomizationNonce, labels, custodianId: 'synthetic-dry-run', unblindingAccess: ['synthetic-dry-run'], attestation: null };
const contents = [{ caseId: fixture.id, A: candidates.A, B: candidates.B }];
const { packet } = freezeBlind(protocol, runs, mapping, contents);
const reviewerId = 'synthetic-dry-run';
const identityKey = digest({ reviewerId });
const ratingCore = { kind: 'hyv-stage1-reviewer-record', version: '1', evidenceClass: 'synthetic-dry-run', protocolDigest: protocol.protocolDigest, candidateDigest, packetDigest: packet.packetDigest, reviewerId, identityKey, recordId: digest({ protocolDigest: protocol.protocolDigest, packetDigest: packet.packetDigest, identityKey, caseId: fixture.id }), sequence: 1, previousRecordDigest: null, caseId: fixture.id, preferredLabel: 'tie', correctionVersusConfirm: { A: 'confirm', B: 'confirm' }, workflow: 'completed' };
const rating = { ...ratingCore, recordDigest: digest(ratingCore), attestation: null };
const ratings = recordRating(packet, [], rating);
const seal = sealRatings(packet, mapping, ratings);
execFileSync(process.execPath, ['scripts/release-audit.mjs'], { cwd: repositoryRoot, stdio: 'pipe' });
const releaseAuditBase = { kind: 'hyv-release-audit', version: '1', candidateCommit: protocol.stage1.sourceCommit, protocolDigest: protocol.protocolDigest, contractDigest: releaseAuditContractDigest, passed: true };
const releaseAudit = { ...releaseAuditBase, digest: digest(releaseAuditBase) };
const report = reduceEvaluation(protocol, runs, packet, mapping, ratings, seal, releaseAudit);
if (report.decision !== 'BLOCKED' || report.promotable !== false || !report.blockers.includes('synthetic_fixture_evidence')) {
  throw new Error('Synthetic dry run did not fail closed.');
}

mkdirSync(outputRoot, { recursive: false, mode: 0o700 });
if (!outsideRepository(realpathSync(outputRoot))) throw new Error('Dry-run output must stay outside the repository.');
writeJson(outputRoot, 'protocol.json', protocol);
writeJson(outputRoot, 'runs.json', runs);
writeJson(outputRoot, 'blind-mapping.json', mapping);
writeJson(outputRoot, 'blind-contents.json', contents);
writeJson(outputRoot, 'blind-packet.json', packet);
writeFileSync(join(outputRoot, 'ratings.ndjson'), `${JSON.stringify(ratings[0])}\n`, { flag: 'wx' });
writeJson(outputRoot, 'ratings-seal.json', seal);
writeJson(outputRoot, 'release-audit.json', releaseAudit);
writeJson(outputRoot, 'report.json', report);
process.stdout.write(`${JSON.stringify({ ok: true, decision: report.decision, promotable: report.promotable, blockers: report.blockers, outputRoot })}\n`);

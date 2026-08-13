import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  EvaluationContractError,
  commitProtocol,
  freezeBlind,
  recordCheckpointDisposition,
  recordRating,
  reduceEvaluation,
  sealRatings,
  sha256Canonical,
  validateRuns,
} from './stage1-evaluation.js';

const hex = (character: string): string => character.repeat(64);

function protocol(mode: 'development-calibration' | 'locked-human' = 'development-calibration') {
  const providerDisclosureDigest = hex('f'); const reviewerDisclosureDigest = hex('8'); const derivedRetentionDigest = hex('9');
  const caseIdentity = { caseId: 'case-1', caseDigest: hex('3'), provenanceDigest: hex('6'), providerDisclosureDigest, reviewerDisclosureDigest, derivedRetentionDigest };
  const nonce = 'AAAAAAAAAAAAAAAAAAAAAA';
  return {
    kind: 'hyv-stage1-preregistration', version: '1', mode,
    baseline: { packageVersion: '3.2.0', sourceCommit: '4e6269121d551c008a34db73077e1e4fea41b3f9' },
    stage1: { sourceCommit: '550ea24f652291dca13757fdbd2f0fa0b5e3f621' },
    benchmark: { manifestDigest: hex('1'), partitionDigest: hex('2'), partition: mode === 'locked-human' ? 'locked-test' : 'calibration', synthetic: mode !== 'locked-human' },
    cases: [{ ...caseIdentity, rightsDigest: sha256Canonical(caseIdentity) }],
    intentToTreat: { expectedAssignments: 2, expectedReviewers: 1 },
    execution: { provider: 'provider-neutral', model: 'pinned-model', modelRevision: 'immutable-revision-1', settingsDigest: hex('a'), taskContractDigest: hex('b'), rulesetDigest: hex('c'), rubricDigest: hex('d') },
    randomization: { algorithm: 'sha256-counter-v1', commitment: sha256Canonical({ algorithm: 'sha256-counter-v1', nonce, labels: { A: 'stage1', B: 'baseline' } }) },
    reviewerRosterDigest: hex('5'),
    analysis: { statistic: 'paired-preference-rate', decisionRule: 'preference-or-correction-with-workflow-non-regression', margin: 0.05, minimumCases: 1, minimumRatings: 1, missingRatingPolicy: 'count-as-non-preference', tiePolicy: 'count-as-half', retryPolicy: 'no-retry', routingPolicy: 'precommitted-blind-routing' },
    rights: { providerDisclosureDigest, reviewerDisclosureDigest, derivedRetentionDigest },
    releaseAuditContractDigest: hex('7'),
    registeredAt: '2026-08-13T00:00:00Z',
    measures: ['writer_preference', 'correction_versus_confirm', 'workflow_completion', 'workflow_abandonment'],
    gates: ['semantic', 'copy_spec', 'hygiene', 'preservation', 'cli_mcp_parity', 'backward_compatibility'],
  } as const;
}

function rating(state: ReturnType<typeof setup>, evidenceClass: 'synthetic-dry-run' | 'human' = 'synthetic-dry-run', previous: Array<Record<string, unknown>> = []) {
  const reviewerId = 'reviewer-1';
  const identityKey = sha256Canonical({ reviewerId });
  const core = {
    kind: 'hyv-stage1-reviewer-record', version: '1', evidenceClass,
    protocolDigest: state.committed.protocolDigest, candidateDigest: state.candidateDigest, packetDigest: state.packet.packetDigest,
    reviewerId, identityKey, recordId: sha256Canonical({ protocolDigest: state.committed.protocolDigest, packetDigest: state.packet.packetDigest, identityKey, caseId: 'case-1' }),
    sequence: previous.length + 1, previousRecordDigest: previous.length ? previous.at(-1)!.recordDigest : null,
    caseId: 'case-1', preferredLabel: 'A', correctionVersusConfirm: { A: 'confirm', B: 'correction' }, workflow: 'completed',
  } as const;
  return { ...core, recordDigest: sha256Canonical(core), attestation: null };
}

function setup(mode: 'development-calibration' | 'locked-human' = 'development-calibration') {
  const committed = commitProtocol(protocol(mode));
  const candidateDigest = sha256Canonical({ baseline: committed.baseline, stage1: committed.stage1 });
  const runs = (['baseline', 'stage1'] as const).map((arm, ordinal) => ({
    kind: 'hyv-stage1-run-record', version: '1', evidenceClass: mode === 'locked-human' ? 'human' : 'synthetic-dry-run',
    protocolDigest: committed.protocolDigest, candidateDigest, assignmentId: `assignment-${arm}`,
    participantId: 'participant-1', caseId: 'case-1', caseDigest: hex('3'), rightsDigest: committed.cases[0].rightsDigest, arm,
    ordinal: ordinal + 1, latencyMs: 10, inputTokens: 5, outputTokens: 5, costMicrousd: 1,
    occurredAt: `2026-08-13T00:00:0${ordinal}Z`,
    outcome: 'completed', outputDigest: createHash('sha256').update(arm === 'baseline' ? 'candidate B text' : 'candidate A text').digest('hex'),
    hardGates: { semantic: true, copySpec: true, hygiene: true, preservation: true, cliMcpParity: true, backwardCompatibility: true },
  }));
  const mapping = { kind: 'hyv-stage1-blind-mapping', version: '1', nonce: 'AAAAAAAAAAAAAAAAAAAAAA', labels: { A: 'stage1', B: 'baseline' }, custodianId: 'dry-run-custodian', unblindingAccess: ['dry-run-custodian'], attestation: null } as const;
  const frozen = freezeBlind(committed, runs, mapping, [{ caseId: 'case-1', A: 'candidate A text', B: 'candidate B text' }]);
  return { committed, candidateDigest, runs, mapping, ...frozen };
}

test('canonical preregistration digest is stable and identities are immutable', () => {
  assert.equal(sha256Canonical({ b: 2, a: 1 }), sha256Canonical({ a: 1, b: 2 }));
  const committed = commitProtocol(protocol());
  assert.match(committed.protocolDigest, /^[a-f0-9]{64}$/);
  assert.throws(() => commitProtocol({ ...protocol(), stage1: { sourceCommit: hex('a') } }), (error: unknown) => error instanceof EvaluationContractError && error.code === 'stage1_identity_mismatch');
  assert.throws(() => commitProtocol({ ...protocol(), extra: true }), (error: unknown) => error instanceof EvaluationContractError && error.code === 'unexpected_field');
  assert.throws(() => commitProtocol({ ...protocol('locked-human'), benchmark: { ...protocol('locked-human').benchmark, partition: 'calibration' } }), (error: unknown) => error instanceof EvaluationContractError && error.code === 'benchmark_partition_mismatch');
});

test('run validation binds every digest and reconciles the intent-to-treat denominator', () => {
  const state = setup();
  assert.equal(validateRuns(state.committed, state.runs).denominator, 2);
  assert.throws(() => validateRuns(state.committed, state.runs.slice(1)), (error: unknown) => error instanceof EvaluationContractError && error.code === 'itt_denominator_mismatch');
  assert.throws(() => validateRuns(state.committed, [{ ...state.runs[0], rightsDigest: hex('9') }, state.runs[1]]), (error: unknown) => error instanceof EvaluationContractError && error.code === 'rights_digest_mismatch');
  const { outputDigest: _outputDigest, hardGates: _hardGates, ...failed } = state.runs[0];
  assert.equal(validateRuns(state.committed, [{ ...failed, outcome: 'timeout' }, state.runs[1]]).timeouts, 1);
});

test('preregistration and paired assignments reject the reviewed integrity attacks', () => {
  const base = protocol();
  assert.throws(() => commitProtocol({ ...base, registeredAt: '1' }), (error: unknown) => error instanceof EvaluationContractError && error.code === 'registered_at_invalid');
  assert.throws(() => commitProtocol({ ...base, registeredAt: '2026-02-31T00:00:00Z' }), (error: unknown) => error instanceof EvaluationContractError && error.code === 'registered_at_invalid');
  assert.throws(() => commitProtocol({ ...base, cases: [{ ...base.cases[0], rightsDigest: hex('4') }] }), (error: unknown) => error instanceof EvaluationContractError && error.code === 'case_rights_digest_mismatch');
  const state = setup();
  assert.throws(() => validateRuns(state.committed, [state.runs[0], { ...state.runs[1], ordinal: 1 }]), (error: unknown) => error instanceof EvaluationContractError && error.code === 'ordinal_sequence_invalid');
  assert.throws(() => validateRuns(state.committed, [state.runs[0], { ...state.runs[1], participantId: 'participant-2' }]), (error: unknown) => error instanceof EvaluationContractError && error.code === 'paired_participant_mismatch');
  assert.throws(() => freezeBlind(state.committed, state.runs, { ...state.mapping, nonce: 'short' }, [{ caseId: 'case-1', A: 'candidate A text', B: 'candidate B text' }]), (error: unknown) => error instanceof EvaluationContractError && error.code === 'randomization_nonce_invalid');
  assert.throws(() => freezeBlind(state.committed, state.runs, { ...state.mapping, unblindingAccess: [] }, [{ caseId: 'case-1', A: 'candidate A text', B: 'candidate B text' }]), (error: unknown) => error instanceof EvaluationContractError && error.code === 'unblinding_access_invalid');
});

test('blind packet rejects label leaks and mapping swaps', () => {
  const state = setup();
  const { attestation: _attestation, ...mappingCore } = state.mapping;
  assert.equal(state.packet.mappingDigest, sha256Canonical(mappingCore));
  assert.throws(() => freezeBlind(state.committed, state.runs, state.mapping, [{ caseId: 'case-1', A: 'stage1 output', B: 'safe' }]), (error: unknown) => error instanceof EvaluationContractError && error.code === 'blind_label_leak');
  assert.throws(() => sealRatings(state.packet, { ...state.mapping, labels: { A: 'baseline', B: 'stage1' } }, []), (error: unknown) => error instanceof EvaluationContractError && error.code === 'mapping_digest_mismatch');
});

test('reviewer log is append-only and rejects duplicate or conflicting ratings', () => {
  const state = setup();
  const record = rating(state);
  const records = recordRating(state.packet, [], record);
  assert.equal(records.length, 1);
  assert.throws(() => recordRating(state.packet, records, record), (error: unknown) => error instanceof EvaluationContractError && error.code === 'reviewer_chain_invalid' || error instanceof EvaluationContractError && error.code === 'duplicate_reviewer_record');
  const changedCore = { ...record, preferredLabel: 'B', sequence: 2, previousRecordDigest: record.recordDigest, recordDigest: undefined, attestation: undefined }; delete (changedCore as { recordDigest?: unknown }).recordDigest; delete (changedCore as { attestation?: unknown }).attestation;
  assert.throws(() => recordRating(state.packet, records, { ...changedCore, recordDigest: sha256Canonical(changedCore), attestation: null }), (error: unknown) => error instanceof EvaluationContractError && error.code === 'conflicting_reviewer_record');
});

test('development/calibration reduction is always blocked and non-promotable', () => {
  const state = setup();
  const records = recordRating(state.packet, [], rating(state));
  const seal = sealRatings(state.packet, state.mapping, records);
  const auditCore = { kind: 'hyv-release-audit', version: '1', candidateCommit: state.committed.stage1.sourceCommit, protocolDigest: state.committed.protocolDigest, contractDigest: state.committed.releaseAuditContractDigest, passed: true } as const;
  const releaseAudit = { ...auditCore, digest: sha256Canonical(auditCore) } as const;
  const report = reduceEvaluation(state.committed, state.runs, state.packet, state.mapping, records, seal, releaseAudit);
  assert.equal(report.decision, 'BLOCKED');
  assert.equal(report.promotable, false);
  assert.ok((report.blockers as string[]).includes('synthetic_fixture_evidence'));
  assert.ok((report.blockers as string[]).includes('locked_human_evidence_required'));
  assert.ok((report.blockers as string[]).includes('human_writer_evidence_deferred'));
});

test('locked-human evidence rejects missing external signatures and release-audit drift', () => {
  const state = setup('locked-human');
  const unsigned = rating(state, 'human');
  assert.throws(() => recordRating(state.packet, [], unsigned), (error: unknown) => error instanceof EvaluationContractError && error.code === 'human_attestation_required');
  const signed = { ...unsigned, attestation: { kind: 'external-verification-receipt', version: '1', verified: true, artifactDigest: unsigned.recordDigest, trustStoreDigest: hex('a'), keyId: 'human-key-1', purpose: 'stage1-blind-review', protocolDigest: state.committed.protocolDigest, packetDigest: state.packet.packetDigest, nonce: 'nonce-1', issuedAt: '2026-08-13T00:00:00Z', expiresAt: '2026-08-14T00:00:00Z', verifiedAt: '2026-08-13T00:01:00Z' } } as const;
  const records = recordRating(state.packet, [], signed);
  const seal = sealRatings(state.packet, state.mapping, records);
  assert.throws(() => reduceEvaluation(state.committed, state.runs, state.packet, state.mapping, records, seal, { kind: 'hyv-release-audit', version: '1', candidateCommit: hex('8'), protocolDigest: state.committed.protocolDigest, contractDigest: state.committed.releaseAuditContractDigest, passed: true, digest: hex('7') }), (error: unknown) => error instanceof EvaluationContractError && error.code === 'release_audit_digest_mismatch');
});

test('forged locked-human JSON cannot pass or proceed while human evidence is deferred', () => {
  const state = setup(); const records = recordRating(state.packet, [], rating(state)); const seal = sealRatings(state.packet, state.mapping, records);
  const auditCore = { kind: 'hyv-release-audit', version: '1', candidateCommit: state.committed.stage1.sourceCommit, protocolDigest: state.committed.protocolDigest, contractDigest: state.committed.releaseAuditContractDigest, passed: true } as const;
  const report = reduceEvaluation(state.committed, state.runs, state.packet, state.mapping, records, seal, { ...auditCore, digest: sha256Canonical(auditCore) });
  const fake: Record<string, unknown> = { ...report, decision: 'PASS', promotable: true, blockers: [] }; const { reportDigest: _old, ...core } = fake;
  const forged = { ...core, reportDigest: sha256Canonical(core) };
  assert.throws(() => recordCheckpointDisposition(forged, 'PROCEED_TO_MAR_363', {}), (error: unknown) => error instanceof EvaluationContractError && error.code === 'report_must_be_blocked');
  assert.throws(() => recordCheckpointDisposition(forged, 'STOP', {}), (error: unknown) => error instanceof EvaluationContractError && error.code === 'report_must_be_blocked');
  assert.throws(() => recordCheckpointDisposition(forged, 'REPEAT_PROTOCOL', {}), (error: unknown) => error instanceof EvaluationContractError && error.code === 'report_must_be_blocked');
  const emptyNestedCore = { ...report, intentToTreat: {}, metrics: {}, reportDigest: undefined }; delete (emptyNestedCore as { reportDigest?: unknown }).reportDigest;
  const emptyNested = { ...emptyNestedCore, reportDigest: sha256Canonical(emptyNestedCore) };
  assert.throws(() => recordCheckpointDisposition(emptyNested, 'STOP', {}), (error: unknown) => error instanceof EvaluationContractError && error.code === 'missing_field');
});

test('a failed arm is committed as non-reviewable and remains in the ITT report', () => {
  const state = setup();
  const { outputDigest: _output, hardGates: _gates, ...stage1Failure } = state.runs[1];
  const runs = [state.runs[0], { ...stage1Failure, outcome: 'timeout' as const }];
  const { packet } = freezeBlind(state.committed, runs, state.mapping, [], [{ caseId: 'case-1', baselineOutcome: 'completed', stage1Outcome: 'timeout' }]);
  assert.equal(packet.reviewableCount, 0); assert.equal(packet.nonReviewableCount, 1);
  const abandonedCore = { ...rating({ ...state, packet }), workflow: 'abandoned', preferredLabel: undefined, correctionVersusConfirm: undefined, recordDigest: undefined, attestation: undefined }; delete (abandonedCore as { preferredLabel?: unknown }).preferredLabel; delete (abandonedCore as { correctionVersusConfirm?: unknown }).correctionVersusConfirm; delete (abandonedCore as { recordDigest?: unknown }).recordDigest; delete (abandonedCore as { attestation?: unknown }).attestation;
  const abandoned = { ...abandonedCore, recordDigest: sha256Canonical(abandonedCore), attestation: null };
  const ratings = recordRating(packet, [], abandoned); const seal = sealRatings(packet, state.mapping, ratings);
  const auditCore = { kind: 'hyv-release-audit', version: '1', candidateCommit: state.committed.stage1.sourceCommit, protocolDigest: state.committed.protocolDigest, contractDigest: state.committed.releaseAuditContractDigest, passed: true } as const;
  const report = reduceEvaluation(state.committed, runs, packet, state.mapping, ratings, seal, { ...auditCore, digest: sha256Canonical(auditCore) });
  assert.equal(report.decision, 'BLOCKED');
  assert.equal((report.metrics as any).preference.denominator, 1);
  assert.equal((report.metrics as any).preference.numerator, 0);
  assert.equal((report.metrics as any).abandonment.numerator, 1);
  assert.equal((report.metrics as any).correctionVersusConfirm.stage1.corrections, 0);
  assert.equal((report.metrics as any).correctionVersusConfirm.baseline.corrections, 0);
  assert.equal((report.metrics as any).providerRuns.timeouts, 1);
});

test('failed hard gates never enter blind review and packet counts reconcile at reduction', () => {
  const state = setup();
  const runs = [state.runs[0], { ...state.runs[1], hardGates: { ...state.runs[1].hardGates, semantic: false } }];
  const { packet } = freezeBlind(state.committed, runs, state.mapping, [], [{ caseId: 'case-1', baselineOutcome: 'completed', stage1Outcome: 'hard-gate-failed' }]);
  assert.equal(packet.reviewableCount, 0);
  const abandonedCore = { ...rating({ ...state, packet }), workflow: 'abandoned', preferredLabel: undefined, correctionVersusConfirm: undefined, recordDigest: undefined, attestation: undefined }; delete (abandonedCore as { preferredLabel?: unknown }).preferredLabel; delete (abandonedCore as { correctionVersusConfirm?: unknown }).correctionVersusConfirm; delete (abandonedCore as { recordDigest?: unknown }).recordDigest; delete (abandonedCore as { attestation?: unknown }).attestation;
  const ratings = recordRating(packet, [], { ...abandonedCore, recordDigest: sha256Canonical(abandonedCore), attestation: null });
  const seal = sealRatings(packet, state.mapping, ratings);
  const auditCore = { kind: 'hyv-release-audit', version: '1', candidateCommit: state.committed.stage1.sourceCommit, protocolDigest: state.committed.protocolDigest, contractDigest: state.committed.releaseAuditContractDigest, passed: true } as const;
  const forgedPacketCore = { ...packet, reviewableCount: 1, nonReviewableCount: 0, packetDigest: undefined }; delete (forgedPacketCore as { packetDigest?: unknown }).packetDigest;
  const forgedPacket = { ...forgedPacketCore, packetDigest: sha256Canonical(forgedPacketCore) };
  assert.throws(() => reduceEvaluation(state.committed, runs, forgedPacket, state.mapping, ratings, seal, { ...auditCore, digest: sha256Canonical(auditCore) }), (error: unknown) => error instanceof EvaluationContractError && error.code === 'blind_packet_count_mismatch');
});

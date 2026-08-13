import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.js';

export const BASELINE_COMMIT = '4e6269121d551c008a34db73077e1e4fea41b3f9';
export const STAGE1_COMMIT = '550ea24f652291dca13757fdbd2f0fa0b5e3f621';

type RecordValue = Record<string, unknown>;
type Arm = 'baseline' | 'stage1';
type EvidenceClass = 'synthetic-dry-run' | 'human';

export class EvaluationContractError extends Error {
  constructor(public readonly code: string) {
    super(`Stage 1 evaluation rejected (${code}).`);
    this.name = 'EvaluationContractError';
  }
}

function fail(code: string): never { throw new EvaluationContractError(code); }
function record(value: unknown, code = 'invalid_record'): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(code);
  return value as RecordValue;
}
function text(value: unknown, code = 'invalid_string'): string {
  if (typeof value !== 'string' || value.length === 0) fail(code);
  return value;
}
function digest(value: unknown, code = 'invalid_digest'): string {
  const result = text(value, code);
  if (!/^[a-f0-9]{64}$/.test(result)) fail(code);
  return result;
}
function timestamp(value: unknown, code: string): string {
  const result = text(value, code);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(result) || !Number.isFinite(Date.parse(result))) fail(code);
  const canonical = result.includes('.') ? result : result.replace('Z', '.000Z');
  if (new Date(result).toISOString() !== canonical) fail(code);
  return result;
}
function exactKeys(value: RecordValue, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail('unexpected_field');
  if (keys.some((key) => !(key in value))) fail('missing_field');
}
function finiteNumber(value: unknown, minimum: number, maximum = Number.POSITIVE_INFINITY, code = 'invalid_number'): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(code);
  return value;
}
function count(value: unknown, code = 'invalid_count'): number {
  const result = finiteNumber(value, 0, Number.POSITIVE_INFINITY, code);
  if (!Number.isInteger(result)) fail(code);
  return result;
}

export function sha256Canonical(value: unknown): string {
  try { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
  catch { return fail('non_canonical_value'); }
}
function sha256Text(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function wilson95(numerator: number, denominator: number): [number, number] {
  if (denominator === 0) return [0, 0];
  const rate = numerator / denominator; const z = 1.96;
  const center = (rate + z * z / (2 * denominator)) / (1 + z * z / denominator);
  const spread = z * Math.sqrt((rate * (1 - rate) + z * z / (4 * denominator)) / denominator) / (1 + z * z / denominator);
  return [Math.max(0, center - spread), Math.min(1, center + spread)];
}

export interface CommittedProtocol extends RecordValue {
  kind: 'hyv-stage1-preregistration'; version: '1'; mode: 'development-calibration' | 'locked-human';
  baseline: { packageVersion: '3.2.0'; sourceCommit: typeof BASELINE_COMMIT };
  stage1: { sourceCommit: typeof STAGE1_COMMIT };
  benchmark: { manifestDigest: string; partitionDigest: string; partition: string; synthetic: boolean };
  cases: Array<{ caseId: string; caseDigest: string; provenanceDigest: string; rightsDigest: string; providerDisclosureDigest: string; reviewerDisclosureDigest: string; derivedRetentionDigest: string }>;
  intentToTreat: { expectedAssignments: number; expectedReviewers: number };
  execution: { provider: string; model: string; modelRevision: string; settingsDigest: string; taskContractDigest: string; rulesetDigest: string; rubricDigest: string };
  randomization: { algorithm: string; commitment: string }; reviewerRosterDigest: string;
  analysis: { statistic: string; decisionRule: string; margin: number; minimumCases: number; minimumRatings: number; missingRatingPolicy: string; tiePolicy: string; retryPolicy: string; routingPolicy: string };
  rights: { providerDisclosureDigest: string; reviewerDisclosureDigest: string; derivedRetentionDigest: string };
  releaseAuditContractDigest: string; registeredAt: string;
  measures: string[]; gates: string[]; protocolDigest: string;
}

function parseProtocol(input: unknown): Omit<CommittedProtocol, 'protocolDigest'> {
  const value = record(input);
  exactKeys(value, ['kind', 'version', 'mode', 'baseline', 'stage1', 'benchmark', 'cases', 'intentToTreat', 'execution', 'randomization', 'reviewerRosterDigest', 'analysis', 'rights', 'releaseAuditContractDigest', 'registeredAt', 'measures', 'gates']);
  if (value.kind !== 'hyv-stage1-preregistration' || value.version !== '1') fail('protocol_version_invalid');
  if (value.mode !== 'development-calibration' && value.mode !== 'locked-human') fail('protocol_mode_invalid');
  const baseline = record(value.baseline); exactKeys(baseline, ['packageVersion', 'sourceCommit']);
  if (baseline.packageVersion !== '3.2.0' || baseline.sourceCommit !== BASELINE_COMMIT) fail('baseline_identity_mismatch');
  const stage1 = record(value.stage1); exactKeys(stage1, ['sourceCommit']);
  if (stage1.sourceCommit !== STAGE1_COMMIT) fail('stage1_identity_mismatch');
  const benchmark = record(value.benchmark); exactKeys(benchmark, ['manifestDigest', 'partitionDigest', 'partition', 'synthetic']);
  digest(benchmark.manifestDigest); digest(benchmark.partitionDigest); text(benchmark.partition);
  if (typeof benchmark.synthetic !== 'boolean') fail('benchmark_synthetic_invalid');
  if ((value.mode === 'locked-human') === benchmark.synthetic) fail('evidence_class_mismatch');
  if (value.mode === 'locked-human' && benchmark.partition !== 'locked-test') fail('benchmark_partition_mismatch');
  if (!Array.isArray(value.cases) || value.cases.length === 0) fail('cases_invalid');
  const caseIds = new Set<string>();
  for (const item of value.cases) {
    const entry = record(item); exactKeys(entry, ['caseId', 'caseDigest', 'provenanceDigest', 'rightsDigest', 'providerDisclosureDigest', 'reviewerDisclosureDigest', 'derivedRetentionDigest']);
    const id = text(entry.caseId); for (const key of ['caseDigest', 'provenanceDigest', 'rightsDigest', 'providerDisclosureDigest', 'reviewerDisclosureDigest', 'derivedRetentionDigest']) digest(entry[key]);
    const expectedRights = sha256Canonical({ caseId: entry.caseId, caseDigest: entry.caseDigest, provenanceDigest: entry.provenanceDigest, providerDisclosureDigest: entry.providerDisclosureDigest, reviewerDisclosureDigest: entry.reviewerDisclosureDigest, derivedRetentionDigest: entry.derivedRetentionDigest }); if (entry.rightsDigest !== expectedRights) fail('case_rights_digest_mismatch');
    if (caseIds.has(id)) fail('duplicate_case'); caseIds.add(id);
  }
  const itt = record(value.intentToTreat); exactKeys(itt, ['expectedAssignments', 'expectedReviewers']);
  if (!Number.isInteger(itt.expectedAssignments) || (itt.expectedAssignments as number) < 1 || !Number.isInteger(itt.expectedReviewers) || (itt.expectedReviewers as number) < 1) fail('itt_invalid');
  const execution = record(value.execution); exactKeys(execution, ['provider', 'model', 'modelRevision', 'settingsDigest', 'taskContractDigest', 'rulesetDigest', 'rubricDigest']);
  text(execution.provider); text(execution.model); text(execution.modelRevision); for (const key of ['settingsDigest', 'taskContractDigest', 'rulesetDigest', 'rubricDigest']) digest(execution[key]);
  const randomization = record(value.randomization); exactKeys(randomization, ['algorithm', 'commitment']); text(randomization.algorithm); digest(randomization.commitment);
  digest(value.reviewerRosterDigest);
  const analysis = record(value.analysis); exactKeys(analysis, ['statistic', 'decisionRule', 'margin', 'minimumCases', 'minimumRatings', 'missingRatingPolicy', 'tiePolicy', 'retryPolicy', 'routingPolicy']);
  if (analysis.statistic !== 'paired-preference-rate' || analysis.decisionRule !== 'preference-or-correction-with-workflow-non-regression') fail('analysis_statistic_invalid'); if (typeof analysis.margin !== 'number' || analysis.margin < 0 || analysis.margin > 1) fail('analysis_margin_invalid');
  if (!Number.isInteger(analysis.minimumCases) || (analysis.minimumCases as number) < 1 || !Number.isInteger(analysis.minimumRatings) || (analysis.minimumRatings as number) < 1) fail('analysis_minimum_invalid');
  if (analysis.missingRatingPolicy !== 'count-as-non-preference' || analysis.tiePolicy !== 'count-as-half' || analysis.retryPolicy !== 'no-retry' || analysis.routingPolicy !== 'precommitted-blind-routing') fail('analysis_policy_invalid');
  const rights = record(value.rights); exactKeys(rights, ['providerDisclosureDigest', 'reviewerDisclosureDigest', 'derivedRetentionDigest']);
  digest(rights.providerDisclosureDigest); digest(rights.reviewerDisclosureDigest); digest(rights.derivedRetentionDigest); digest(value.releaseAuditContractDigest);
  if (value.cases.some((item) => { const entry = item as RecordValue; return entry.providerDisclosureDigest !== rights.providerDisclosureDigest || entry.reviewerDisclosureDigest !== rights.reviewerDisclosureDigest || entry.derivedRetentionDigest !== rights.derivedRetentionDigest; })) fail('rights_scope_mismatch');
  timestamp(value.registeredAt, 'registered_at_invalid');
  if (JSON.stringify(value.measures) !== JSON.stringify(['writer_preference', 'correction_versus_confirm', 'workflow_completion', 'workflow_abandonment'])) fail('measures_invalid');
  if (JSON.stringify(value.gates) !== JSON.stringify(['semantic', 'copy_spec', 'hygiene', 'preservation', 'cli_mcp_parity', 'backward_compatibility'])) fail('gates_invalid');
  return value as unknown as Omit<CommittedProtocol, 'protocolDigest'>;
}

export function commitProtocol(input: unknown): CommittedProtocol {
  const protocol = parseProtocol(input);
  return { ...protocol, protocolDigest: sha256Canonical(protocol) } as CommittedProtocol;
}

function assertCommittedProtocol(input: unknown): CommittedProtocol {
  const value = record(input);
  const { protocolDigest, ...protocol } = value;
  const parsed = parseProtocol(protocol);
  if (digest(protocolDigest, 'protocol_digest_invalid') !== sha256Canonical(parsed)) fail('protocol_digest_mismatch');
  return value as unknown as CommittedProtocol;
}

export interface RunRecord extends RecordValue {
  kind: 'hyv-stage1-run-record'; version: '1'; evidenceClass: EvidenceClass;
  protocolDigest: string; candidateDigest: string; assignmentId: string; participantId: string;
  caseId: string; caseDigest: string; rightsDigest: string; arm: Arm;
  ordinal: number; latencyMs: number; inputTokens: number; outputTokens: number; costMicrousd: number; occurredAt: string;
  outcome: 'completed' | 'hard-failure' | 'timeout' | 'abandoned'; outputDigest?: string;
  hardGates?: { semantic: boolean; copySpec: boolean; hygiene: boolean; preservation: boolean; cliMcpParity: boolean; backwardCompatibility: boolean };
}

type EffectiveRunOutcome = RunRecord['outcome'] | 'hard-gate-failed';
function effectiveRunOutcome(run: RunRecord): EffectiveRunOutcome {
  if (run.outcome === 'completed' && run.hardGates && Object.values(run.hardGates).some((passed) => !passed)) return 'hard-gate-failed';
  return run.outcome;
}

function candidateDigest(protocol: CommittedProtocol): string {
  return sha256Canonical({ baseline: protocol.baseline, stage1: protocol.stage1 });
}

function parseRun(protocol: CommittedProtocol, input: unknown): RunRecord {
  const value = record(input);
  const required = ['kind', 'version', 'evidenceClass', 'protocolDigest', 'candidateDigest', 'assignmentId', 'participantId', 'caseId', 'caseDigest', 'rightsDigest', 'arm', 'ordinal', 'latencyMs', 'inputTokens', 'outputTokens', 'costMicrousd', 'occurredAt', 'outcome'];
  exactKeys(value, value.outcome === 'completed' ? [...required, 'outputDigest', 'hardGates'] : required);
  if (value.kind !== 'hyv-stage1-run-record' || value.version !== '1') fail('run_version_invalid');
  if (value.protocolDigest !== protocol.protocolDigest) fail('protocol_digest_mismatch');
  if (value.candidateDigest !== candidateDigest(protocol)) fail('candidate_digest_mismatch');
  if (value.evidenceClass !== (protocol.mode === 'locked-human' ? 'human' : 'synthetic-dry-run')) fail('evidence_class_mismatch');
  text(value.assignmentId); text(value.participantId); const caseId = text(value.caseId);
  const expected = protocol.cases.find((item) => item.caseId === caseId); if (!expected) fail('case_unknown');
  if (value.caseDigest !== expected.caseDigest) fail('case_digest_mismatch');
  if (value.rightsDigest !== expected.rightsDigest) fail('rights_digest_mismatch');
  if (value.arm !== 'baseline' && value.arm !== 'stage1') fail('arm_invalid');
  if (!Number.isInteger(value.ordinal) || (value.ordinal as number) < 1) fail('ordinal_invalid');
  for (const key of ['latencyMs', 'inputTokens', 'outputTokens', 'costMicrousd']) if (typeof value[key] !== 'number' || (value[key] as number) < 0 || !Number.isFinite(value[key] as number)) fail('run_measure_invalid');
  timestamp(value.occurredAt, 'occurred_at_invalid');
  if (!['completed', 'hard-failure', 'timeout', 'abandoned'].includes(String(value.outcome))) fail('outcome_invalid');
  if (value.outcome === 'completed') digest(value.outputDigest, 'output_digest_invalid');
  if (value.outcome === 'completed') {
    const gates = record(value.hardGates); exactKeys(gates, ['semantic', 'copySpec', 'hygiene', 'preservation', 'cliMcpParity', 'backwardCompatibility']);
    if (Object.values(gates).some((item) => typeof item !== 'boolean')) fail('hard_gates_invalid');
  }
  return value as unknown as RunRecord;
}

export function validateRuns(protocolInput: unknown, runInputs: unknown): { denominator: number; completed: number; hardFailures: number; timeouts: number; abandonments: number; runsDigest: string } {
  const protocol = assertCommittedProtocol(protocolInput);
  if (!Array.isArray(runInputs)) fail('runs_invalid');
  const runs = runInputs.map((item) => parseRun(protocol, item));
  if (runs.length !== protocol.intentToTreat.expectedAssignments) fail('itt_denominator_mismatch');
  if (new Set(runs.map((run) => run.assignmentId)).size !== runs.length) fail('duplicate_assignment');
  if (JSON.stringify(runs.map((run) => run.ordinal).sort((a, b) => a - b)) !== JSON.stringify(Array.from({ length: runs.length }, (_, index) => index + 1))) fail('ordinal_sequence_invalid');
  for (const item of protocol.cases) {
    const pair = runs.filter((run) => run.caseId === item.caseId); const arms = pair.map((run) => run.arm).sort();
    if (JSON.stringify(arms) !== JSON.stringify(['baseline', 'stage1'])) fail('paired_assignment_mismatch');
    if (new Set(pair.map((run) => run.participantId)).size !== 1) fail('paired_participant_mismatch');
  }
  return { denominator: runs.length, completed: runs.filter((r) => effectiveRunOutcome(r) === 'completed').length, hardFailures: runs.filter((r) => ['hard-failure', 'hard-gate-failed'].includes(effectiveRunOutcome(r))).length, timeouts: runs.filter((r) => r.outcome === 'timeout').length, abandonments: runs.filter((r) => r.outcome === 'abandoned').length, runsDigest: sha256Canonical(runs) };
}

export interface BlindPacket extends RecordValue {
  kind: 'hyv-stage1-blind-packet'; version: '1'; protocolDigest: string; candidateDigest: string;
  runsDigest: string; mappingDigest: string; contentDigest: string; nonReviewableDigest: string; reviewableCount: number; nonReviewableCount: number; encryptedAtRest: true; approvedStorage: true; packetDigest: string;
}

function parsePacket(input: unknown): BlindPacket {
  const packet = record(input); exactKeys(packet, ['kind', 'version', 'protocolDigest', 'candidateDigest', 'runsDigest', 'mappingDigest', 'contentDigest', 'nonReviewableDigest', 'reviewableCount', 'nonReviewableCount', 'encryptedAtRest', 'approvedStorage', 'packetDigest']);
  if (packet.kind !== 'hyv-stage1-blind-packet' || packet.version !== '1' || packet.encryptedAtRest !== true || packet.approvedStorage !== true) fail('blind_packet_invalid');
  for (const key of ['protocolDigest', 'candidateDigest', 'runsDigest', 'mappingDigest', 'contentDigest', 'nonReviewableDigest', 'packetDigest']) digest(packet[key]);
  if (!Number.isInteger(packet.reviewableCount) || !Number.isInteger(packet.nonReviewableCount) || (packet.reviewableCount as number) < 0 || (packet.nonReviewableCount as number) < 0) fail('blind_packet_invalid');
  const { packetDigest, ...base } = packet; if (packetDigest !== sha256Canonical(base)) fail('packet_digest_mismatch');
  return packet as unknown as BlindPacket;
}

interface BlindMapping extends RecordValue { kind: 'hyv-stage1-blind-mapping'; version: '1'; nonce: string; labels: Record<'A' | 'B', Arm>; custodianId: string; unblindingAccess: string[]; attestation: unknown }
function parseMapping(input: unknown): BlindMapping {
  const mapping = record(input); exactKeys(mapping, ['kind', 'version', 'nonce', 'labels', 'custodianId', 'unblindingAccess', 'attestation']);
  if (mapping.kind !== 'hyv-stage1-blind-mapping' || mapping.version !== '1') fail('blind_mapping_invalid');
  const labels = record(mapping.labels); exactKeys(labels, ['A', 'B']);
  if (!['baseline', 'stage1'].includes(String(labels.A)) || !['baseline', 'stage1'].includes(String(labels.B)) || labels.A === labels.B) fail('blind_mapping_invalid');
  if (!/^[A-Za-z0-9_-]{22,}$/.test(text(mapping.nonce))) fail('randomization_nonce_invalid');
  text(mapping.custodianId);
  if (!Array.isArray(mapping.unblindingAccess) || mapping.unblindingAccess.length === 0 || new Set(mapping.unblindingAccess).size !== mapping.unblindingAccess.length || !mapping.unblindingAccess.every((item) => typeof item === 'string' && item.length > 0)) fail('unblinding_access_invalid');
  if (mapping.attestation !== null) validateAttestation(mapping.attestation);
  return mapping as BlindMapping;
}
function mappingCore(mapping: BlindMapping): Omit<BlindMapping, 'attestation'> { const { attestation: _attestation, ...core } = mapping; return core; }
function validateMappingOpening(protocol: CommittedProtocol, mapping: BlindMapping): void {
  if (protocol.randomization.algorithm !== 'sha256-counter-v1' || protocol.randomization.commitment !== sha256Canonical({ algorithm: protocol.randomization.algorithm, nonce: mapping.nonce, labels: mapping.labels })) fail('randomization_commitment_mismatch');
}

export function freezeBlind(protocolInput: unknown, runInputs: unknown, mappingInput: unknown, contentsInput: unknown, nonReviewableInput: unknown = []): { packet: BlindPacket } {
  const protocol = assertCommittedProtocol(protocolInput); const runSummary = validateRuns(protocol, runInputs);
  const mapping = parseMapping(mappingInput);
  validateMappingOpening(protocol, mapping);
  if (!Array.isArray(contentsInput)) fail('blind_contents_invalid');
  const contents = contentsInput.map((item) => { const entry = record(item); exactKeys(entry, ['caseId', 'A', 'B']); text(entry.caseId); text(entry.A); text(entry.B); return entry; });
  if (/baseline|stage\s*[-_ ]?1|550ea24|4e626912/i.test(canonicalJson(contents))) fail('blind_label_leak');
  if (!Array.isArray(nonReviewableInput)) fail('non_reviewable_invalid');
  const allowedOutcomes = ['completed', 'hard-failure', 'hard-gate-failed', 'timeout', 'abandoned'];
  const nonReviewable = nonReviewableInput.map((item) => { const entry = record(item); exactKeys(entry, ['caseId', 'baselineOutcome', 'stage1Outcome']); text(entry.caseId); if (!allowedOutcomes.includes(String(entry.baselineOutcome)) || !allowedOutcomes.includes(String(entry.stage1Outcome))) fail('non_reviewable_invalid'); return entry; });
  const completedCases = protocol.cases.filter((item) => (runInputs as RunRecord[]).filter((run) => run.caseId === item.caseId && effectiveRunOutcome(run) === 'completed').length === 2).map((item) => item.caseId);
  const incompleteCases = protocol.cases.map((item) => item.caseId).filter((id) => !completedCases.includes(id));
  if (contents.length !== completedCases.length || new Set(contents.map((item) => item.caseId)).size !== completedCases.length || contents.some((item) => !completedCases.includes(item.caseId as string))) fail('blind_case_set_mismatch');
  if (nonReviewable.length !== incompleteCases.length || new Set(nonReviewable.map((item) => item.caseId)).size !== incompleteCases.length || nonReviewable.some((item) => !incompleteCases.includes(item.caseId as string))) fail('non_reviewable_mismatch');
  for (const entry of nonReviewable) for (const arm of ['baseline', 'stage1'] as const) { const run = (runInputs as RunRecord[]).find((candidate) => candidate.caseId === entry.caseId && candidate.arm === arm); if (!run || effectiveRunOutcome(run) !== entry[`${arm}Outcome`]) fail('non_reviewable_mismatch'); }
  for (const entry of contents) {
    for (const label of ['A', 'B'] as const) {
      const arm = mapping.labels[label];
      const run = (runInputs as RunRecord[]).find((item) => item.caseId === entry.caseId && item.arm === arm && effectiveRunOutcome(item) === 'completed');
      if (!run || run.outputDigest !== sha256Text(entry[label] as string)) fail('blind_content_digest_mismatch');
    }
  }
  const base = { kind: 'hyv-stage1-blind-packet' as const, version: '1' as const, protocolDigest: protocol.protocolDigest, candidateDigest: candidateDigest(protocol), runsDigest: runSummary.runsDigest, mappingDigest: sha256Canonical(mappingCore(mapping)), contentDigest: sha256Canonical(contents), nonReviewableDigest: sha256Canonical(nonReviewable), reviewableCount: contents.length, nonReviewableCount: nonReviewable.length, encryptedAtRest: true as const, approvedStorage: true as const };
  return { packet: { ...base, packetDigest: sha256Canonical(base) } };
}

export interface ReviewerRecord extends RecordValue {
  kind: 'hyv-stage1-reviewer-record'; version: '1'; evidenceClass: EvidenceClass; protocolDigest: string; candidateDigest: string; packetDigest: string;
  reviewerId: string; identityKey: string; recordId: string; sequence: number; previousRecordDigest: string | null; recordDigest: string;
  caseId: string; preferredLabel?: 'A' | 'B' | 'tie'; correctionVersusConfirm?: { A: 'correction' | 'confirm'; B: 'correction' | 'confirm' }; workflow: 'completed' | 'abandoned'; attestation: unknown;
}

function validateAttestation(value: unknown, artifactDigest?: string, protocolDigest?: string, packetDigest?: string): void {
  const item = record(value, 'human_attestation_required');
  exactKeys(item, ['kind', 'version', 'verified', 'artifactDigest', 'trustStoreDigest', 'keyId', 'purpose', 'protocolDigest', 'packetDigest', 'nonce', 'issuedAt', 'expiresAt', 'verifiedAt']);
  if (item.kind !== 'external-verification-receipt' || item.version !== '1' || item.verified !== true) fail('human_attestation_required');
  if (artifactDigest && item.artifactDigest !== artifactDigest) fail('attestation_binding_mismatch'); else digest(item.artifactDigest, 'human_attestation_required');
  digest(item.trustStoreDigest, 'human_attestation_required'); text(item.keyId, 'human_attestation_required'); text(item.purpose, 'human_attestation_required'); text(item.nonce, 'human_attestation_required');
  if (protocolDigest && item.protocolDigest !== protocolDigest) fail('attestation_binding_mismatch'); else digest(item.protocolDigest, 'human_attestation_required');
  if (packetDigest && item.packetDigest !== packetDigest) fail('attestation_binding_mismatch'); else digest(item.packetDigest, 'human_attestation_required');
  for (const key of ['issuedAt', 'expiresAt', 'verifiedAt']) timestamp(item[key], 'human_attestation_required');
  if (Date.parse(item.expiresAt as string) <= Date.parse(item.issuedAt as string) || Date.parse(item.verifiedAt as string) < Date.parse(item.issuedAt as string) || Date.parse(item.verifiedAt as string) > Date.parse(item.expiresAt as string)) fail('human_attestation_required');
}

function parseRating(packet: BlindPacket, input: unknown): ReviewerRecord {
  const value = record(input); const baseKeys = ['kind', 'version', 'evidenceClass', 'protocolDigest', 'candidateDigest', 'packetDigest', 'reviewerId', 'identityKey', 'recordId', 'sequence', 'previousRecordDigest', 'recordDigest', 'caseId', 'workflow', 'attestation']; exactKeys(value, value.workflow === 'completed' ? [...baseKeys, 'preferredLabel', 'correctionVersusConfirm'] : baseKeys);
  if (value.kind !== 'hyv-stage1-reviewer-record' || value.version !== '1') fail('reviewer_record_version_invalid');
  if (value.protocolDigest !== packet.protocolDigest || value.candidateDigest !== packet.candidateDigest || value.packetDigest !== packet.packetDigest) fail('reviewer_digest_chain_mismatch');
  const reviewerId = text(value.reviewerId); text(value.caseId); digest(value.identityKey, 'reviewer_identity_invalid'); digest(value.recordId, 'reviewer_record_id_invalid'); digest(value.recordDigest, 'reviewer_record_digest_invalid');
  if (value.identityKey !== sha256Canonical({ reviewerId })) fail('reviewer_identity_mismatch');
  if (value.recordId !== sha256Canonical({ protocolDigest: packet.protocolDigest, packetDigest: packet.packetDigest, identityKey: value.identityKey, caseId: value.caseId })) fail('reviewer_record_id_mismatch');
  if (!Number.isInteger(value.sequence) || (value.sequence as number) < 1) fail('reviewer_sequence_invalid');
  if (value.previousRecordDigest !== null) digest(value.previousRecordDigest, 'previous_record_digest_invalid');
  if (!['completed', 'abandoned'].includes(String(value.workflow))) fail('workflow_invalid');
  if (value.workflow === 'completed') { if (!['A', 'B', 'tie'].includes(String(value.preferredLabel))) fail('preference_invalid'); const correction = record(value.correctionVersusConfirm); exactKeys(correction, ['A', 'B']); if (!['correction', 'confirm'].includes(String(correction.A)) || !['correction', 'confirm'].includes(String(correction.B))) fail('correction_measure_invalid'); }
  const { attestation, recordDigest, ...core } = value;
  if (recordDigest !== sha256Canonical(core)) fail('reviewer_record_digest_mismatch');
  if (value.evidenceClass === 'human') {
    validateAttestation(attestation, recordDigest as string, packet.protocolDigest, packet.packetDigest);
    if ((attestation as RecordValue).purpose !== 'stage1-blind-review') fail('attestation_purpose_mismatch');
  } else if (value.evidenceClass !== 'synthetic-dry-run' || attestation !== null) fail('evidence_class_mismatch');
  return value as unknown as ReviewerRecord;
}

export function recordRating(packetInput: unknown, existingInput: unknown, ratingInput: unknown): ReviewerRecord[] {
  const packet = parsePacket(packetInput);
  if (!Array.isArray(existingInput)) fail('reviewer_log_invalid');
  const existing = existingInput.map((item) => parseRating(packet, item)); const rating = parseRating(packet, ratingInput);
  const same = existing.find((item) => item.identityKey === rating.identityKey && item.caseId === rating.caseId);
  if (same) fail(same.preferredLabel === rating.preferredLabel && (same.correctionVersusConfirm === undefined ? rating.correctionVersusConfirm === undefined : sha256Canonical(same.correctionVersusConfirm) === sha256Canonical(rating.correctionVersusConfirm)) && same.workflow === rating.workflow ? 'duplicate_reviewer_record' : 'conflicting_reviewer_record');
  for (let index = 0; index < existing.length; index += 1) {
    if (existing[index].sequence !== index + 1 || existing[index].previousRecordDigest !== (index === 0 ? null : existing[index - 1].recordDigest)) fail('reviewer_chain_invalid');
  }
  if (rating.sequence !== existing.length + 1 || rating.previousRecordDigest !== (existing.length === 0 ? null : existing[existing.length - 1].recordDigest)) fail('reviewer_chain_invalid');
  return [...existing, rating];
}

function validateReviewerLog(protocol: CommittedProtocol | undefined, packet: BlindPacket, ratingsInput: unknown, requireComplete: boolean): ReviewerRecord[] {
  if (!Array.isArray(ratingsInput)) fail('reviewer_log_invalid');
  const ratings = ratingsInput.map((item) => parseRating(packet, item));
  for (let index = 0; index < ratings.length; index += 1) {
    if (ratings[index].sequence !== index + 1 || ratings[index].previousRecordDigest !== (index === 0 ? null : ratings[index - 1].recordDigest)) fail('reviewer_chain_invalid');
    if (protocol && !protocol.cases.some((item) => item.caseId === ratings[index].caseId)) fail('reviewer_case_unknown');
  }
  const pairs = ratings.map((item) => `${item.identityKey}\0${item.caseId}`);
  if (new Set(pairs).size !== pairs.length) fail('duplicate_reviewer_record');
  if (protocol && requireComplete) {
    const identities = new Set(ratings.map((item) => item.identityKey));
    if (identities.size !== protocol.intentToTreat.expectedReviewers || ratings.length !== protocol.intentToTreat.expectedReviewers * protocol.cases.length) fail('reviewer_matrix_mismatch');
    for (const identity of identities) for (const item of protocol.cases) if (!pairs.includes(`${identity}\0${item.caseId}`)) fail('reviewer_matrix_mismatch');
  }
  return ratings;
}

export function sealRatings(packetInput: unknown, mappingInput: unknown, ratingsInput: unknown): RecordValue {
  const packet = parsePacket(packetInput); const mapping = parseMapping(mappingInput);
  if (sha256Canonical(mappingCore(mapping)) !== packet.mappingDigest) fail('mapping_digest_mismatch');
  const ratings = validateReviewerLog(undefined, packet, ratingsInput, false);
  const base = { kind: 'hyv-stage1-ratings-seal', version: '1', protocolDigest: packet.protocolDigest, candidateDigest: packet.candidateDigest, packetDigest: packet.packetDigest, mappingDigest: packet.mappingDigest, ratingsDigest: sha256Canonical(ratings), recordCount: ratings.length };
  return { ...base, sealDigest: sha256Canonical(base) };
}

export function reduceEvaluation(protocolInput: unknown, runsInput: unknown, packetInput: unknown, mappingInput: unknown, ratingsInput: unknown, sealInput: unknown, releaseAuditInput: unknown): RecordValue {
  const protocol = assertCommittedProtocol(protocolInput); const summary = validateRuns(protocol, runsInput); const packet = parsePacket(packetInput);
  if (packet.protocolDigest !== protocol.protocolDigest || packet.candidateDigest !== candidateDigest(protocol) || packet.runsDigest !== summary.runsDigest) fail('packet_digest_chain_mismatch');
  const runRows = runsInput as RunRecord[];
  const expectedReviewableCount = protocol.cases.filter((entry) => runRows.filter((run) => run.caseId === entry.caseId && effectiveRunOutcome(run) === 'completed').length === 2).length;
  if (packet.reviewableCount !== expectedReviewableCount || packet.nonReviewableCount !== protocol.cases.length - expectedReviewableCount) fail('blind_packet_count_mismatch');
  const mapping = parseMapping(mappingInput); validateMappingOpening(protocol, mapping);
  const ratings = validateReviewerLog(protocol, packet, ratingsInput, true);
  const seal = sealRatings(packet, mapping, ratings); if (sha256Canonical(seal) !== sha256Canonical(sealInput)) fail('ratings_seal_mismatch');
  const audit = record(releaseAuditInput); exactKeys(audit, ['kind', 'version', 'candidateCommit', 'protocolDigest', 'contractDigest', 'passed', 'digest']);
  const { digest: auditDigest, ...auditCore } = audit; if (auditDigest !== sha256Canonical(auditCore)) fail('release_audit_digest_mismatch');
  if (audit.kind !== 'hyv-release-audit' || audit.version !== '1' || audit.candidateCommit !== protocol.stage1.sourceCommit || audit.protocolDigest !== protocol.protocolDigest || audit.contractDigest !== protocol.releaseAuditContractDigest || audit.passed !== true) fail('release_audit_binding_mismatch');
  const blockers: string[] = ['human_writer_evidence_deferred'];
  if (protocol.benchmark.synthetic || ratings.some((r) => r.evidenceClass === 'synthetic-dry-run')) blockers.push('synthetic_fixture_evidence');
  if (protocol.mode !== 'locked-human') blockers.push('locked_human_evidence_required');
  if (protocol.mode === 'locked-human') {
    blockers.push('reviewer_roster_verification_deferred');
    const { attestation, ...openingCore } = mapping;
    try {
      validateAttestation(attestation, sha256Canonical(openingCore), protocol.protocolDigest, packet.packetDigest);
      if ((attestation as RecordValue).purpose !== 'stage1-mapping-custody') throw new Error('purpose');
    } catch { blockers.push('mapping_custody_attestation_required'); }
  }
  if (ratings.length !== protocol.intentToTreat.expectedReviewers * protocol.cases.length) blockers.push('reviewer_denominator_mismatch');
  if (protocol.cases.length < protocol.analysis.minimumCases || ratings.length < protocol.analysis.minimumRatings) blockers.push('preregistered_minimum_not_met');
  if ((runsInput as RunRecord[]).some((run) => run.hardGates && Object.values(run.hardGates).some((passed) => !passed))) blockers.push('hard_gate_regression');
  const completedRatings = ratings.filter((rating) => rating.workflow === 'completed');
  const preferred = completedRatings.reduce((total, rating) => total + (rating.preferredLabel === 'tie' ? 0.5 : mapping.labels[rating.preferredLabel as 'A' | 'B'] === 'stage1' ? 1 : 0), 0);
  const preferenceDenominator = protocol.intentToTreat.expectedReviewers * protocol.cases.length;
  const preferenceRate = preferenceDenominator ? preferred / preferenceDenominator : 0;
  const stage1Confirm = completedRatings.filter((rating) => rating.correctionVersusConfirm![mapping.labels.A === 'stage1' ? 'A' : 'B'] === 'confirm').length;
  const baselineConfirm = completedRatings.filter((rating) => rating.correctionVersusConfirm![mapping.labels.A === 'baseline' ? 'A' : 'B'] === 'confirm').length;
  const correctionMarginMet = (stage1Confirm - baselineConfirm) / preferenceDenominator >= protocol.analysis.margin;
  if (preferenceRate < 0.5 + protocol.analysis.margin && !correctionMarginMet) blockers.push('checkpoint_threshold_not_met');
  const workflowByArm = (arm: Arm) => ({ completed: runRows.filter((run) => run.arm === arm && effectiveRunOutcome(run) === 'completed').length, denominator: runRows.filter((run) => run.arm === arm).length });
  const baselineWorkflow = workflowByArm('baseline'); const stage1Workflow = workflowByArm('stage1');
  if (stage1Workflow.denominator === 0 || baselineWorkflow.denominator === 0 || stage1Workflow.completed / stage1Workflow.denominator < baselineWorkflow.completed / baselineWorkflow.denominator) blockers.push('workflow_regression');
  const stage1Correction = completedRatings.filter((rating) => rating.correctionVersusConfirm![mapping.labels.A === 'stage1' ? 'A' : 'B'] === 'correction').length;
  const baselineCorrection = completedRatings.filter((rating) => rating.correctionVersusConfirm![mapping.labels.A === 'baseline' ? 'A' : 'B'] === 'correction').length;
  const metrics = {
    preference: { numerator: preferred, denominator: preferenceDenominator, rate: preferenceRate, uncertainty95: wilson95(preferred, preferenceDenominator) },
    correctionVersusConfirm: { stage1: { corrections: stage1Correction, confirms: stage1Confirm, denominator: preferenceDenominator, correctionRate: stage1Correction / preferenceDenominator, uncertainty95: wilson95(stage1Correction, preferenceDenominator) }, baseline: { corrections: baselineCorrection, confirms: baselineConfirm, denominator: preferenceDenominator, correctionRate: baselineCorrection / preferenceDenominator, uncertainty95: wilson95(baselineCorrection, preferenceDenominator) } },
    completion: { numerator: completedRatings.length, denominator: preferenceDenominator, rate: completedRatings.length / preferenceDenominator, uncertainty95: wilson95(completedRatings.length, preferenceDenominator) },
    abandonment: { numerator: ratings.length - completedRatings.length, denominator: preferenceDenominator, rate: (ratings.length - completedRatings.length) / preferenceDenominator, uncertainty95: wilson95(ratings.length - completedRatings.length, preferenceDenominator) },
    providerRuns: { completed: summary.completed, abandoned: summary.abandonments, hardFailures: summary.hardFailures, timeouts: summary.timeouts, denominator: summary.denominator },
  };
  const intentToTreat = { ...summary, expectedRatings: preferenceDenominator, observedRatings: ratings.length, missingRatings: Math.max(0, preferenceDenominator - ratings.length), reconciled: summary.denominator === protocol.intentToTreat.expectedAssignments && ratings.length === preferenceDenominator };
  const base = { kind: 'hyv-stage1-evaluation-report', version: '1', protocolDigest: protocol.protocolDigest, candidateDigest: candidateDigest(protocol), runsDigest: summary.runsDigest, packetDigest: packet.packetDigest, mappingDigest: packet.mappingDigest, sealDigest: seal.sealDigest, releaseAuditDigest: audit.digest, intentToTreat, metrics, decision: blockers.length ? 'BLOCKED' : 'PASS', promotable: blockers.length === 0, blockers };
  return { ...base, reportDigest: sha256Canonical(base) };
}

export function preflight(protocolInput: unknown): RecordValue {
  const protocol = assertCommittedProtocol(protocolInput);
  return { ready: true, protocolDigest: protocol.protocolDigest, humanEvidenceRequired: protocol.mode === 'locked-human' };
}

export function recordCheckpointDisposition(reportInput: unknown, disposition: unknown, attestation: unknown): RecordValue {
  const report = record(reportInput);
  exactKeys(report, ['kind', 'version', 'protocolDigest', 'candidateDigest', 'runsDigest', 'packetDigest', 'mappingDigest', 'sealDigest', 'releaseAuditDigest', 'intentToTreat', 'metrics', 'decision', 'promotable', 'blockers', 'reportDigest']);
  if (report.kind !== 'hyv-stage1-evaluation-report' || report.version !== '1') fail('report_contract_invalid');
  for (const field of ['protocolDigest', 'candidateDigest', 'runsDigest', 'packetDigest', 'mappingDigest', 'sealDigest', 'releaseAuditDigest']) digest(report[field], 'report_digest_chain_invalid');
  if (report.decision !== 'BLOCKED' || report.promotable !== false) fail('report_must_be_blocked');
  if (!Array.isArray(report.blockers)) fail('report_blockers_invalid');
  const blockers = report.blockers as unknown[];
  if (!blockers.every((blocker: unknown) => typeof blocker === 'string') || !blockers.includes('human_writer_evidence_deferred')) fail('report_blockers_invalid');
  const intentToTreat = record(report.intentToTreat, 'report_intent_to_treat_invalid');
  exactKeys(intentToTreat, ['denominator', 'completed', 'hardFailures', 'timeouts', 'abandonments', 'runsDigest', 'expectedRatings', 'observedRatings', 'missingRatings', 'reconciled']);
  for (const field of ['denominator', 'completed', 'hardFailures', 'timeouts', 'abandonments', 'expectedRatings', 'observedRatings', 'missingRatings']) count(intentToTreat[field], 'report_intent_to_treat_invalid');
  digest(intentToTreat.runsDigest, 'report_intent_to_treat_invalid');
  if (typeof intentToTreat.reconciled !== 'boolean') fail('report_intent_to_treat_invalid');
  const metrics = record(report.metrics, 'report_metrics_invalid');
  exactKeys(metrics, ['preference', 'correctionVersusConfirm', 'completion', 'abandonment', 'providerRuns']);
  const rateMetric = (value: unknown, fields: readonly string[]): void => {
    const metric = record(value, 'report_metrics_invalid'); exactKeys(metric, fields);
    for (const field of fields) {
      if (field === 'uncertainty95') {
        if (!Array.isArray(metric[field]) || metric[field].length !== 2) fail('report_metrics_invalid');
        for (const bound of metric[field] as unknown[]) finiteNumber(bound, 0, 1, 'report_metrics_invalid');
      } else if (field === 'rate' || field === 'correctionRate') finiteNumber(metric[field], 0, 1, 'report_metrics_invalid');
      else count(metric[field], 'report_metrics_invalid');
    }
  };
  rateMetric(metrics.preference, ['numerator', 'denominator', 'rate', 'uncertainty95']);
  rateMetric(metrics.completion, ['numerator', 'denominator', 'rate', 'uncertainty95']);
  rateMetric(metrics.abandonment, ['numerator', 'denominator', 'rate', 'uncertainty95']);
  const correction = record(metrics.correctionVersusConfirm, 'report_metrics_invalid'); exactKeys(correction, ['stage1', 'baseline']);
  rateMetric(correction.stage1, ['corrections', 'confirms', 'denominator', 'correctionRate', 'uncertainty95']);
  rateMetric(correction.baseline, ['corrections', 'confirms', 'denominator', 'correctionRate', 'uncertainty95']);
  const providerRuns = record(metrics.providerRuns, 'report_metrics_invalid'); exactKeys(providerRuns, ['completed', 'abandoned', 'hardFailures', 'timeouts', 'denominator']);
  for (const field of ['completed', 'abandoned', 'hardFailures', 'timeouts', 'denominator']) count(providerRuns[field], 'report_metrics_invalid');
  const reportDigest = digest(report.reportDigest, 'report_digest_invalid'); const { reportDigest: _reportDigest, ...reportCore } = report;
  if (reportDigest !== sha256Canonical(reportCore)) fail('report_digest_mismatch');
  const protocolDigest = digest(report.protocolDigest, 'report_digest_chain_invalid'); const packetDigest = digest(report.packetDigest, 'report_digest_chain_invalid'); const releaseAuditDigest = digest(report.releaseAuditDigest, 'report_digest_chain_invalid');
  if (!['PROCEED_TO_MAR_363', 'STOP', 'REPEAT_PROTOCOL'].includes(String(disposition))) fail('checkpoint_disposition_invalid');
  if (disposition === 'PROCEED_TO_MAR_363') fail('human_evidence_deferred');
  const base = { kind: 'hyv-stage1-checkpoint-disposition', version: '1', protocolDigest, packetDigest, releaseAuditDigest, reportDigest, disposition };
  validateAttestation(attestation, sha256Canonical(base), protocolDigest, packetDigest);
  if ((attestation as RecordValue).purpose !== 'stage1-checkpoint-disposition') fail('attestation_purpose_mismatch');
  const artifact = { ...base, attestation };
  return { ...artifact, dispositionDigest: sha256Canonical(artifact) };
}

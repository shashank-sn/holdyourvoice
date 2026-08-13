import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const schemaRoot = join(process.cwd(), 'benchmarks/schema');
const schemaNames = [
  'protocol-manifest.v1',
  'run-event.v1',
  'blind-packet.v1',
  'blind-mapping.v1',
  'reviewer-record.v1',
  'ratings-seal.v1',
  'aggregate-report.v1',
  'checkpoint-disposition.v1',
] as const;

function loadSchema(name: (typeof schemaNames)[number]): Record<string, any> {
  return JSON.parse(readFileSync(join(schemaRoot, `${name}.schema.json`), 'utf8')) as Record<string, any>;
}

function assertWireKeys(name: (typeof schemaNames)[number], keys: string[]): void {
  const schema = loadSchema(name);
  const optionalKeys = name === 'run-event.v1'
    ? ['outputDigest', 'hardGates']
    : name === 'reviewer-record.v1' ? ['preferredLabel', 'correctionVersusConfirm'] : [];
  assert.deepEqual(Object.keys(schema.properties).sort(), [...keys].sort(), `${name} wire keys drifted from the evaluator`);
  assert.deepEqual([...schema.required].sort(), [...keys.filter((key) => !optionalKeys.includes(key))].sort(), `${name} required keys drifted from the evaluator`);
}

test('Stage 1 evidence schemas are strict Draft 2020-12 contracts', () => {
  for (const name of schemaNames) {
    const schema = loadSchema(name);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.$id, `https://holdyourvoice.dev/schemas/${name}.schema.json`);
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.ok(Array.isArray(schema.required) && schema.required.length > 0);
  }
});

test('protocol and evidence schemas bind immutable identities and the complete digest chain', () => {
  const protocol = loadSchema('protocol-manifest.v1');
  assert.equal(protocol.properties.baseline.properties.sourceCommit.const, '4e6269121d551c008a34db73077e1e4fea41b3f9');
  assert.equal(protocol.properties.stage1.properties.sourceCommit.const, '550ea24f652291dca13757fdbd2f0fa0b5e3f621');
  for (const field of ['kind', 'version', 'mode', 'benchmark', 'cases', 'execution', 'reviewerRosterDigest', 'analysis', 'rights', 'releaseAuditContractDigest', 'protocolDigest']) {
    assert.ok(protocol.required.includes(field), `protocol must require ${field}`);
  }

  const run = loadSchema('run-event.v1');
  for (const field of ['protocolDigest', 'candidateDigest', 'caseDigest', 'rightsDigest', 'ordinal', 'latencyMs', 'inputTokens', 'outputTokens', 'costMicrousd']) assert.ok(run.required.includes(field));
  assert.ok(run.oneOf[0].required.includes('outputDigest'), 'completed runs must bind the output digest');
  assert.match(JSON.stringify(run.oneOf[1].not), /outputDigest/, 'failed runs must not fabricate an output digest');
  const packet = loadSchema('blind-packet.v1');
  for (const field of ['protocolDigest', 'candidateDigest', 'runsDigest', 'packetDigest', 'mappingDigest', 'contentDigest', 'nonReviewableDigest', 'reviewableCount', 'nonReviewableCount']) assert.ok(packet.required.includes(field));
  const reviewer = loadSchema('reviewer-record.v1');
  for (const field of ['protocolDigest', 'candidateDigest', 'packetDigest', 'reviewerId', 'identityKey', 'recordId', 'sequence', 'previousRecordDigest', 'recordDigest', 'caseId', 'attestation']) assert.ok(reviewer.required.includes(field));
  assert.equal(reviewer.properties.sourceText, undefined);
  assert.equal(reviewer.properties.correctionText, undefined);
  const seal = loadSchema('ratings-seal.v1');
  for (const field of ['protocolDigest', 'candidateDigest', 'packetDigest', 'mappingDigest', 'ratingsDigest', 'sealDigest']) assert.ok(seal.required.includes(field));
  const report = loadSchema('aggregate-report.v1');
  for (const field of ['protocolDigest', 'candidateDigest', 'runsDigest', 'packetDigest', 'mappingDigest', 'sealDigest', 'releaseAuditDigest', 'intentToTreat', 'metrics']) assert.ok(report.required.includes(field));
});

test('deferred-human artifacts cannot claim pass, promotion, or MAR-363 progression', () => {
  const report = loadSchema('aggregate-report.v1');
  assert.equal(report.properties.decision.const, 'BLOCKED');
  assert.equal(report.properties.promotable.const, false);
  assert.equal(report.properties.blockers.contains.const, 'human_writer_evidence_deferred');
  const disposition = loadSchema('checkpoint-disposition.v1');
  assert.deepEqual(disposition.properties.disposition.enum, ['STOP', 'REPEAT_PROTOCOL']);
  assert.equal(disposition.properties.releaseApproved, undefined, 'checkpoint disposition is not a release approval');
});

test('schema wire keys match evaluator artifacts exactly', () => {
  assertWireKeys('protocol-manifest.v1', ['kind', 'version', 'mode', 'baseline', 'stage1', 'benchmark', 'cases', 'intentToTreat', 'execution', 'randomization', 'reviewerRosterDigest', 'analysis', 'rights', 'releaseAuditContractDigest', 'registeredAt', 'measures', 'gates', 'protocolDigest']);
  assertWireKeys('run-event.v1', ['kind', 'version', 'evidenceClass', 'protocolDigest', 'candidateDigest', 'assignmentId', 'participantId', 'caseId', 'caseDigest', 'rightsDigest', 'arm', 'ordinal', 'latencyMs', 'inputTokens', 'outputTokens', 'costMicrousd', 'occurredAt', 'outcome', 'outputDigest', 'hardGates']);
  assertWireKeys('blind-packet.v1', ['kind', 'version', 'protocolDigest', 'candidateDigest', 'runsDigest', 'mappingDigest', 'contentDigest', 'nonReviewableDigest', 'reviewableCount', 'nonReviewableCount', 'encryptedAtRest', 'approvedStorage', 'packetDigest']);
  assertWireKeys('blind-mapping.v1', ['kind', 'version', 'nonce', 'labels', 'custodianId', 'unblindingAccess', 'attestation']);
  assertWireKeys('reviewer-record.v1', ['kind', 'version', 'evidenceClass', 'protocolDigest', 'candidateDigest', 'packetDigest', 'reviewerId', 'identityKey', 'recordId', 'sequence', 'previousRecordDigest', 'recordDigest', 'caseId', 'preferredLabel', 'correctionVersusConfirm', 'workflow', 'attestation']);
  assertWireKeys('ratings-seal.v1', ['kind', 'version', 'protocolDigest', 'candidateDigest', 'packetDigest', 'mappingDigest', 'ratingsDigest', 'recordCount', 'sealDigest']);
  assertWireKeys('aggregate-report.v1', ['kind', 'version', 'protocolDigest', 'candidateDigest', 'runsDigest', 'packetDigest', 'mappingDigest', 'sealDigest', 'releaseAuditDigest', 'intentToTreat', 'metrics', 'decision', 'promotable', 'blockers', 'reportDigest']);
  assertWireKeys('checkpoint-disposition.v1', ['kind', 'version', 'protocolDigest', 'packetDigest', 'releaseAuditDigest', 'reportDigest', 'disposition', 'attestation', 'dispositionDigest']);
});

test('nested protocol and report contracts match the repaired runtime', () => {
  const protocol = loadSchema('protocol-manifest.v1');
  assert.deepEqual([...protocol.properties.cases.items.required].sort(), ['caseId', 'caseDigest', 'provenanceDigest', 'rightsDigest', 'providerDisclosureDigest', 'reviewerDisclosureDigest', 'derivedRetentionDigest'].sort());
  assert.deepEqual([...protocol.properties.execution.required].sort(), ['provider', 'model', 'modelRevision', 'settingsDigest', 'taskContractDigest', 'rulesetDigest', 'rubricDigest'].sort());
  const reviewer = loadSchema('reviewer-record.v1');
  assert.deepEqual([...reviewer.properties.correctionVersusConfirm.required].sort(), ['A', 'B']);
  assert.ok(!reviewer.required.includes('preferredLabel'));
  assert.ok(!reviewer.required.includes('correctionVersusConfirm'));
  assert.match(JSON.stringify(reviewer.allOf), /abandoned.*preferredLabel.*correctionVersusConfirm/);
  const report = loadSchema('aggregate-report.v1');
  assert.deepEqual([...report.properties.intentToTreat.required].sort(), ['denominator', 'completed', 'hardFailures', 'timeouts', 'abandonments', 'runsDigest', 'expectedRatings', 'observedRatings', 'missingRatings', 'reconciled'].sort());
  assert.deepEqual([...report.properties.metrics.required].sort(), ['preference', 'correctionVersusConfirm', 'completion', 'abandonment', 'providerRuns'].sort());
});

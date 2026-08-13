import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeBatchForMcp, analyzeForMcp, applyRewriteForMcp, buildProfileForMcp, clearLearningForMcp, finalOutputCheckForMcp, finalizeLifecycleForMcp, inspectHygieneForMcp, inspectLearningForMcp, inspectLifecycleForMcp, patternsForMcp, prepareLifecycleForMcp, prepareRewriteForMcp, ratifyLearningForMcp, recordApprovedLearningForMcp, recordLearningForMcp, rewritePromptForMcp, submitSemanticVerdictForMcp, supersedeLearningForMcp, validateFinalApprovalForMcp, verifyCopySpecForMcp, verifyForMcp } from './mcp-tools.js';
import { canonicalJson } from './canonical-json.js';

const profile = buildProfileForMcp(['I write clearly. I keep the useful detail.', 'I make the call. Then I explain the trade-off.'], ['leverage']);
const profileJson = JSON.stringify(profile);

test('builds a portable profile for MCP without files', () => {
  assert.equal(profile.version, '2');
  assert.equal(profile.sampleCount, 2);
});

test('keeps the dual-engine analysis shape through MCP tools', () => {
  const result = analyzeForMcp('I leverage a clear plan.\u200B', profileJson);
  assert.equal(result.voiceDna.engine, 'voice_dna');
  assert.equal(result.aiEditor.engine, 'ai_editor');
  assert.equal(result.hygiene.suspiciousCount, 1);
});

test('inspects Unicode hygiene through MCP without a voice profile', () => {
  const result = inspectHygieneForMcp('one\u200Btwo\u00A0three');
  assert.equal(result.suspiciousCount, 2);
  assert.equal(result.fixableCount, 0);
});

test('gates exact final output through MCP without a voice profile', () => {
  const accepted = finalOutputCheckForMcp('exact output');
  assert.equal(accepted.accepted && accepted.output, 'exact output');

  const rejected = finalOutputCheckForMcp('hidden\u200Boutput');
  assert.equal(rejected.accepted, false);
  assert.equal('output' in rejected, false);
});

test('accepts optional WritingBrief context and exposes batch findings through MCP helpers', () => {
  const brief = JSON.stringify({
    version: '1', audience: 'founders', intent: 'start a discussion', format: 'social', evidenceStatus: 'unverified',
    argumentMap: { observation: 'Founders repeat vague advice.', mechanism: 'The advice skips the work.', consequence: 'Readers cannot act.', readerValue: 'Avoid a vague post.' },
  });
  const analysis = analyzeForMcp('A pattern I keep seeing in founder posts is vague advice.', profileJson, brief);
  assert.ok(analysis.editorial?.findings.some((item) => item.id === 'editorial.social.generic-opener'));
  assert.ok(analysis.editorial?.findings.some((item) => item.id === 'editorial.evidence.unverified'));
  const batch = analyzeBatchForMcp(['The launch needs a clear owner.', 'The launch needs a clear owner.']);
  assert.equal(batch.findings.length, 2);
});

test('keeps MCP verification read-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'holdyourvoice-mcp-'));
  try {
    const result = verifyForMcp('I leverage the answer with useful detail and clear mechanism.', 'I use the answer with useful detail and clear mechanism.', profileJson);
    const brief = rewritePromptForMcp('I leverage a clear plan.', profileJson, { root });
    assert.match(brief.prompt, /Tier 0/);
    assert.doesNotMatch(brief.prompt, /Learned local preferences/);
    assert.equal(result.preservationScore >= 70, true);
    assert.equal('learning' in result, false);
    assert.deepEqual(inspectLearningForMcp(profileJson, { root }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prepares, submits, and inspects the normal lifecycle through MCP helpers', () => {
  const deterministicBase = { version: '1', verificationKind: 'standard', passed: true, analysisVersion: '2', rulesetVersion: '3.2.0', preservationMetricVersion: 'legacy-set-v1', preservationScore: 100, sourceHash: '4'.repeat(64), candidateHash: '5'.repeat(64), profileId: 'founder.primary', profileRevisionDigest: '6'.repeat(64), regressionKeys: [] };
  const deterministic = { ...deterministicBase, artifactFingerprint: createHash('sha256').update(`hyv:deterministic-verification:v1\0${canonicalJson(deterministicBase)}`).digest('hex') };
  const binding = { rewriteTaskFingerprint: '1'.repeat(64), rewriteResponseFingerprint: '2'.repeat(64), deterministicArtifactFingerprint: deterministic.artifactFingerprint, sourceHash: deterministic.sourceHash, candidateHash: deterministic.candidateHash, profileId: deterministic.profileId, profileRevisionDigest: deterministic.profileRevisionDigest, rulesetVersion: deterministic.rulesetVersion, schemaVersion: '1' };
  const receipt = { version: '1', taskFingerprint: binding.rewriteTaskFingerprint, responseFingerprint: binding.rewriteResponseFingerprint, adapterIds: [], replacementSentenceIds: [1] };
  const prepared = prepareLifecycleForMcp(JSON.stringify(deterministic), JSON.stringify(binding), JSON.stringify(receipt), 'normal', ['action_change']);
  const context = { now: 0, trustStore: { version: '1' as const, audience: '@holdyourvoice/hyv' as const, maxCapabilityLifetimeSeconds: 1, keys: [] }, authorizedSemanticEvaluatorIds: { normal: ['reviewer-1'], highAssurance: [] }, authorizedHumanFinalizerIds: [] };
  const submitted = submitSemanticVerdictForMcp(JSON.stringify(prepared.artifact), JSON.stringify(prepared.task), 'reviewer-1', JSON.stringify({ approved: true, violations: [] }), context);
  assert.equal(submitted.ok && submitted.artifact.status, 'ready_for_human_review');
  assert.equal(inspectLifecycleForMcp(JSON.stringify(submitted.ok && submitted.artifact)).status, 'ready_for_human_review');
  assert.throws(() => prepareLifecycleForMcp(JSON.stringify(deterministic), JSON.stringify(binding), JSON.stringify(receipt), 'high_assurance', ['action_change']), /trusted embedding/);
  const forgedTask = { ...prepared.task, allowedViolations: ['unsupported_claim'] };
  assert.throws(() => submitSemanticVerdictForMcp(JSON.stringify(prepared.artifact), JSON.stringify(forgedTask), 'reviewer-1', JSON.stringify({ approved: false, violations: ['unsupported_claim'] }), context));
});

test('validates and finalizes signed approval with helper/core parity and no bearer output', () => {
  const deterministicBase = { version: '1', verificationKind: 'standard', passed: true, analysisVersion: '2', rulesetVersion: '3.2.0', preservationMetricVersion: 'legacy-set-v1', preservationScore: 100, sourceHash: '4'.repeat(64), candidateHash: '5'.repeat(64), profileId: 'founder.primary', profileRevisionDigest: '6'.repeat(64), regressionKeys: [] };
  const deterministic = { ...deterministicBase, artifactFingerprint: createHash('sha256').update(`hyv:deterministic-verification:v1\0${canonicalJson(deterministicBase)}`).digest('hex') };
  const binding = { rewriteTaskFingerprint: '1'.repeat(64), rewriteResponseFingerprint: '2'.repeat(64), deterministicArtifactFingerprint: deterministic.artifactFingerprint, sourceHash: deterministic.sourceHash, candidateHash: deterministic.candidateHash, profileId: deterministic.profileId, profileRevisionDigest: deterministic.profileRevisionDigest, rulesetVersion: deterministic.rulesetVersion, schemaVersion: '1' };
  const receipt = { version: '1', taskFingerprint: binding.rewriteTaskFingerprint, responseFingerprint: binding.rewriteResponseFingerprint, adapterIds: [], replacementSentenceIds: [1] };
  const prepared = prepareLifecycleForMcp(JSON.stringify(deterministic), JSON.stringify(binding), JSON.stringify(receipt), 'normal', ['action_change']);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const trustStore = { version: '1' as const, audience: '@holdyourvoice/hyv' as const, maxCapabilityLifetimeSeconds: 300, keys: [{ issuer: 'host', keyId: 'k1', publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'), status: 'active' as const }] };
  const context = { now: 150, trustStore, authorizedSemanticEvaluatorIds: { normal: ['reviewer-1'], highAssurance: [] }, authorizedHumanFinalizerIds: ['human-1'] };
  const submitted = submitSemanticVerdictForMcp(JSON.stringify(prepared.artifact), JSON.stringify(prepared.task), 'reviewer-1', JSON.stringify({ approved: true, violations: [] }), context); assert.equal(submitted.ok, true); if (!submitted.ok) return;
  const claims = { version: '1', purpose: 'hyv.final-approval', issuer: 'host', audience: '@holdyourvoice/hyv', subjectArtifactFingerprint: submitted.artifact.artifactFingerprint, sourceHash: binding.sourceHash, candidateHash: binding.candidateHash, profileId: binding.profileId, profileRevisionDigest: binding.profileRevisionDigest, keyId: 'k1', issuedAt: 100, notBefore: 100, expiresAt: 200, nonce: 'mcp-secret-nonce' };
  const payload = Buffer.from(canonicalJson(claims)); const capability = { payload: payload.toString('base64url'), signature: sign(null, payload, privateKey).toString('base64url') };
  const validated = validateFinalApprovalForMcp(JSON.stringify(submitted.artifact), canonicalJson(capability), context); assert.equal(validated.ok, true);
  const finalized = finalizeLifecycleForMcp(JSON.stringify(submitted.artifact), JSON.stringify({ evaluatorId: 'human-1', decision: 'approve' }), context, canonicalJson(capability)); assert.equal(finalized.ok && finalized.artifact.status, 'approved');
  assert.throws(() => finalizeLifecycleForMcp(JSON.stringify(submitted.artifact), JSON.stringify({ evaluatorId: 'human-1', decision: 'reject' }), context, canonicalJson(capability)), /does not accept/);
  assert.doesNotMatch(JSON.stringify({ validated, finalized }), /mcp-secret-nonce|payload|signature/);
});

test('records approved learning once and treats an exact replay as a no-op', () => {
  const root = mkdtempSync(join(tmpdir(), 'holdyourvoice-mcp-approved-'));
  const previousHome = process.env.HYV_HOME;
  process.env.HYV_HOME = root;
  try {
    const source = 'I leverage the answer with useful detail and clear mechanism.';
    const candidate = 'I use the answer with useful detail and clear mechanism.';
    const rewriteTask = prepareRewriteForMcp(source, profileJson);
    const evaluation = applyRewriteForMcp(JSON.stringify(rewriteTask), JSON.stringify({
      version: '1', taskFingerprint: rewriteTask.fingerprint, replacements: [{ sentenceId: 1, text: candidate }],
    }), profileJson);
    assert.equal(evaluation.status, 'needs_semantic_review');
    const prepared = prepareLifecycleForMcp(JSON.stringify(evaluation.deterministicArtifact), JSON.stringify(evaluation.lifecycleBinding), JSON.stringify(evaluation.receipt), 'normal', []);
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const trustStore = { version: '1' as const, audience: '@holdyourvoice/hyv' as const, maxCapabilityLifetimeSeconds: 300, keys: [{ issuer: 'host', keyId: 'k1', publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'), status: 'active' as const }] };
    const context = { now: 150, trustStore, authorizedSemanticEvaluatorIds: { normal: ['reviewer-1'], highAssurance: [] }, authorizedHumanFinalizerIds: ['human-1'] };
    const submitted = submitSemanticVerdictForMcp(JSON.stringify(prepared.artifact), JSON.stringify(prepared.task), 'reviewer-1', JSON.stringify({ approved: true, violations: [] }), context);
    assert.equal(submitted.ok, true); if (!submitted.ok) return;
    const binding = submitted.artifact.binding;
    const claims = { version: '1', purpose: 'hyv.final-approval', issuer: 'host', audience: '@holdyourvoice/hyv', subjectArtifactFingerprint: submitted.artifact.artifactFingerprint, sourceHash: binding.sourceHash, candidateHash: binding.candidateHash, profileId: binding.profileId, profileRevisionDigest: binding.profileRevisionDigest, keyId: 'k1', issuedAt: 100, notBefore: 100, expiresAt: 200, nonce: 'approved-learning-secret' };
    const payload = Buffer.from(canonicalJson(claims));
    const capability = canonicalJson({ payload: payload.toString('base64url'), signature: sign(null, payload, privateKey).toString('base64url') });
    const decision = JSON.stringify({ evaluatorId: 'human-1', decision: 'approve' });
    const finalized = finalizeLifecycleForMcp(JSON.stringify(submitted.artifact), decision, context, capability);
    assert.equal(finalized.ok, true); if (!finalized.ok) return;
    const request = { readyJson: JSON.stringify(submitted.artifact), approvedJson: JSON.stringify(finalized.artifact), source, candidate, profileJson, decisionJson: decision, capabilityJson: capability, context };
    assert.equal(recordApprovedLearningForMcp(request), 'recorded');
    assert.equal(recordApprovedLearningForMcp(request), 'nothing_to_learn');
    const stored = JSON.stringify(inspectLearningForMcp(profileJson, { root }));
    assert.equal(JSON.parse(stored).length, 1);
    assert.doesNotMatch(stored, /approved-learning-secret|payload|signature|I leverage|I use/);
  } finally {
    if (previousHome === undefined) delete process.env.HYV_HOME; else process.env.HYV_HOME = previousHome;
    rmSync(root, { recursive: true, force: true });
  }
});

test('exposes text-free learning inspection and explicit mutations through MCP helpers', () => {
  const root = mkdtempSync(join(tmpdir(), 'holdyourvoice-mcp-learning-'));
  const unsigned = { ...profile, version: '3', id: 'founder.test', revision: 1, provenance: { source: 'test', rights: 'test', createdAt: '2026-08-13T00:00:00.000Z' }, rulePolicy: {}, fingerprint: { contractionRate: 0, sentenceLengthDistribution: { short: 1, medium: 0, long: 0 }, bulletRate: 0, enDashRate: 0 }, tolerances: { contractionRate: { absolute: 0.1, calibrated: false }, sentenceLengthDistribution: { absolute: 0.1, calibrated: false }, bulletRate: { absolute: 0.1, calibrated: false }, enDashRate: { absolute: 0.1, calibrated: false } }, metricFixtures: { contractionRate: ['test'], sentenceLengthDistribution: ['test'], bulletRate: ['test'], enDashRate: ['test'] } };
  const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}` : JSON.stringify(value);
  const profileV3 = { ...unsigned, revisionDigest: createHash('sha256').update(canonical(unsigned)).digest('hex') };
  const v3Json = JSON.stringify(profileV3);
  try {
    const recorded = recordLearningForMcp(v3Json, 'Keep the mechanism concrete.', { root, mutationId: 'm1', authority: 'founder', provenance: 'editor-review', weight: 2, compatibility: 'exact' });
    assert.equal(recorded.status, 'recorded');
    assert.equal(recordLearningForMcp(v3Json, 'Different instruction.', { root, mutationId: 'm1' }).status, 'conflict');
    const inspection = inspectLearningForMcp(v3Json, { root });
    assert.equal(inspection[0]?.eventType, 'instruction');
    assert.equal(JSON.stringify(inspection).includes('Keep the mechanism concrete.'), false);
    assert.equal(ratifyLearningForMcp(v3Json, recorded.eventId, { root, mutationId: 'm2', authority: 'founder' }).status, 'recorded');
    assert.equal(supersedeLearningForMcp(v3Json, recorded.eventId, { root, mutationId: 'm3', authority: 'founder' }).status, 'recorded');
    assert.equal(clearLearningForMcp(v3Json, { root }).cleared, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('exposes the executable pattern IDs through MCP tools', () => {
  const catalog = patternsForMcp();
  assert.ok(catalog.rules.some((rule) => rule.id === 'ai.leverage'));
});

test('fails closed on changed CopySpec claims through MCP tools', () => {
  const result = verifyCopySpecForMcp('The launch is on 14 August.', 'The launch is next month.', profileJson, JSON.stringify({
    version: '1', audience: 'operators', intent: 'explain', channel: 'email',
    claims: [{ id: 'launch-date', text: 'The launch is on 14 August.', evidence: 'Release calendar.' }],
  }));
  assert.equal(result.passed, false);
  assert.equal(result.claims.failures[0]?.code, 'missing_immutable_claim');
  assert.equal('learning' in result, false);
});

test('allows declared CopySpec atoms to survive a split MCP rewrite', () => {
  const spec = JSON.stringify({
    version: '1', audience: 'operators', intent: 'explain', channel: 'email',
    claims: [{ id: 'model-size', text: 'Kimi K2.6 has 600 GB of INT4 weights.', atoms: ['Kimi K2.6 uses INT4 weights', 'payload is 600 GB'], evidence: 'Technical report.' }],
  });
  const preserved = verifyCopySpecForMcp('Kimi K2.6 has 600 GB of INT4 weights.', 'Kimi K2.6 uses INT4 weights. The payload is 600 GB.', profileJson, spec);
  assert.equal(preserved.claims.passed, true);
  const missing = verifyCopySpecForMcp('Kimi K2.6 has 600 GB of INT4 weights.', 'Kimi K2.6 uses INT4 weights.', profileJson, spec);
  assert.deepEqual(missing.claims.failures.map((failure) => failure.code), ['missing_immutable_atom']);
});

test('prepares and applies the rewrite task through MCP helpers', () => {
  const task = prepareRewriteForMcp('I leverage the answer with useful detail and clear mechanism.', profileJson);
  const result = applyRewriteForMcp(JSON.stringify(task), JSON.stringify({
    version: '1', taskFingerprint: task.fingerprint, replacements: [{ sentenceId: 1, text: 'I use the answer with useful detail and clear mechanism.' }],
  }), profileJson);
  assert.equal(result.status, 'needs_semantic_review');
  assert.equal(result.candidate, 'I use the answer with useful detail and clear mechanism.');
});

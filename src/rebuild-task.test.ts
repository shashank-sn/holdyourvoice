import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import type { ApprovalCapabilityClaimsV1, ApprovalCapabilityEnvelopeV1, ApprovalTrustStoreV1, CopySpec, PreEditReduction } from './contracts.js';
import { canonicalJson, canonicalJsonBytes } from './canonical-json.js';
import { applyRewriteResponse, prepareRewriteTask } from './rewrite-task.js';
import { applyRebuildResponse, evaluateRebuildResponse, parseRebuildTask, prepareRebuildTask } from './rebuild-task.js';
import { bindJudgmentEnvelope, preparePreEditJudgment, reducePreEdit } from './judgment-task.js';
import { verifyDeterministically, verifyRebuildWithCopySpec } from './pipeline.js';
import { prepareLifecycle, recordApprovedLearning } from './lifecycle-adapter.js';
import { buildProfile } from './voice-dna.js';
import { HYV_VERSION } from './version.js';
import type { RecompositionPolicyV1 } from './contracts.js';

const profile = buildProfile([
  'I write clear notes. I keep the mechanism visible.',
  'I name the trade-off. Then I make the next step plain.',
], ['leverage']);

const draft = 'I leverage the answer. The launch is on 14 August.';
const rebuilt = 'Ship planning now treats one calendar fact as fixed. The launch is on 14 August. Every other sentence in this note is new operational language for the release desk.';
const copySpec: CopySpec = {
  version: '1',
  audience: 'operators',
  intent: 'explain',
  channel: 'email',
  claims: [{ id: 'launch-date', text: 'The launch is on 14 August.', evidence: 'Release calendar, 7 August.' }],
};

const recompositionPolicy: RecompositionPolicyV1 = {
  version: '1', mode: 'meaning-first',
  lexicalResidual: { ngramSize: 5, maxSharedNgramFraction: 0, maxLongestSharedRunTokens: 4 },
  acknowledgement: 'Measures shared wording only; does not detect or prove removal of a watermark.',
};

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const trustStore: ApprovalTrustStoreV1 = {
  version: '1',
  audience: '@holdyourvoice/hyv',
  maxCapabilityLifetimeSeconds: 300,
  keys: [{ issuer: 'host.example', keyId: 'key-1', publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), status: 'active' }],
};

function envelope(task: ReturnType<typeof preparePreEditJudgment>, decision: 'SHIP' | 'EDIT' | 'REBUILD', extra: Record<string, unknown> = {}) {
  return {
    version: '1' as const,
    stage: task.stage,
    judgmentType: task.judgmentType,
    taskFingerprint: task.taskFingerprint,
    bindings: { ...task.bindings, evaluatorId: 'writer.1' },
    findings: [],
    decision,
    ...extra,
  };
}

function rebuildRecommendation(text = draft): PreEditReduction {
  const triage = preparePreEditJudgment(text, profile, 'triage');
  const argument = preparePreEditJudgment(text, profile, 'argument');
  const form = preparePreEditJudgment(text, profile, 'form');
  return reducePreEdit([
    bindJudgmentEnvelope(triage, envelope(triage, 'SHIP')),
    bindJudgmentEnvelope(argument, envelope(argument, 'REBUILD')),
    bindJudgmentEnvelope(form, envelope(form, 'SHIP')),
  ]);
}

function capability(reduction: PreEditReduction, overrides: Partial<ApprovalCapabilityClaimsV1> = {}, source = draft): ApprovalCapabilityEnvelopeV1 {
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const identity = `legacy-v2:${createHash('sha256').update(canonicalJson(profile)).digest('hex')}`;
  const claims: ApprovalCapabilityClaimsV1 = {
    version: '1',
    purpose: 'hyv.rebuild-authorization',
    issuer: 'host.example',
    audience: '@holdyourvoice/hyv',
    subjectArtifactFingerprint: reduction.recommendationFingerprint,
    sourceHash,
    candidateHash: sourceHash,
    profileId: identity,
    profileRevisionDigest: identity,
    keyId: 'key-1',
    issuedAt: 100,
    notBefore: 100,
    expiresAt: 200,
    nonce: 'nonce-rebuild',
    ...overrides,
  };
  const payload = canonicalJsonBytes(claims);
  return { payload: payload.toString('base64url'), signature: sign(null, payload, privateKey).toString('base64url') };
}

function evaluate(task: ReturnType<typeof prepareRebuildTask>, raw: unknown, reduction: PreEditReduction, boundProfile = profile) {
  return evaluateRebuildResponse(task, raw, boundProfile, capability(reduction), trustStore, 150);
}

test('pre-edit reductions carry a stable recommendation fingerprint', () => {
  const left = rebuildRecommendation();
  const right = rebuildRecommendation();
  assert.equal(left.decision, 'REBUILD');
  assert.match(left.recommendationFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(left.recommendationFingerprint, right.recommendationFingerprint);
});

test('a caller cannot self-select rebuild or submit a forged authorization', () => {
  const reduction = rebuildRecommendation();
  const edit = { ...reduction, decision: 'EDIT' as const };
  assert.throws(() => prepareRebuildTask(draft, profile, edit, copySpec, capability(reduction), trustStore, 150), /upstream REBUILD recommendation/);
  assert.throws(() => prepareRebuildTask(draft, profile, reduction, copySpec, capability(reduction, { purpose: 'hyv.final-approval' }), trustStore, 150), /Rebuild authorization is invalid/);
  assert.throws(() => prepareRebuildTask(draft, profile, reduction, copySpec, capability(reduction, { nonce: 'stale' }), { ...trustStore, keys: [{ ...trustStore.keys[0]!, status: 'revoked' }] }, 150), /Rebuild authorization is invalid/);
  assert.throws(() => prepareRebuildTask(draft, profile, reduction, copySpec, capability(reduction, { sourceHash: '8'.repeat(64) }), trustStore, 150), /Rebuild authorization is invalid/);
  assert.throws(() => prepareRebuildTask(draft, profile, { ...reduction, recommendationFingerprint: 'a'.repeat(64) }, copySpec, capability(reduction), trustStore, 150), /upstream REBUILD recommendation/);
});

test('missing CopySpec blocks rebuild before a candidate is evaluated', () => {
  const reduction = rebuildRecommendation();
  assert.throws(() => prepareRebuildTask(draft, profile, reduction, { ...copySpec, claims: [] } as CopySpec, capability(reduction), trustStore, 150), /CopySpec/);
});

test('edit and rebuild responses are mutually incompatible', () => {
  const reduction = rebuildRecommendation();
  const rebuildTask = prepareRebuildTask(draft, profile, reduction, copySpec, capability(reduction), trustStore, 150);
  const editTask = prepareRewriteTask(draft, profile);
  const rebuildOnEdit = applyRewriteResponse(editTask, { version: '1', mode: 'REBUILD', taskFingerprint: editTask.fingerprint, candidate: rebuilt });
  assert.equal(rebuildOnEdit.status, 'repairable');
  assert.equal(rebuildOnEdit.failures[0]?.code, 'rebuild_response_on_edit_task');
  const replacementsOnRebuild = applyRebuildResponse(rebuildTask, { version: '1', taskFingerprint: rebuildTask.fingerprint, replacements: [{ sentenceId: 1, text: 'I use the answer.' }] });
  assert.equal(replacementsOnRebuild.status, 'repairable');
  assert.equal(replacementsOnRebuild.failures[0]?.code, 'edit_response_on_rebuild_task');
  const unsigned = applyRebuildResponse(rebuildTask, { version: '1', mode: 'REBUILD', taskFingerprint: rebuildTask.fingerprint, candidate: rebuilt });
  assert.equal(unsigned.status, 'accepted');
  assert.equal(unsigned.receipt.authorizationFingerprint, undefined);
  assert.equal(unsigned.receipt.preservationBypass, undefined);
});

test('authorized rebuild allows low lexical survival while claims and hygiene still block', () => {
  const reduction = rebuildRecommendation();
  const task = prepareRebuildTask(draft, profile, reduction, copySpec, capability(reduction), trustStore, 150);
  const passed = evaluate(task, { version: '1', mode: 'REBUILD', taskFingerprint: task.fingerprint, candidate: rebuilt }, reduction);
  assert.equal(passed.status, 'needs_semantic_review');
  assert.ok((passed.verification?.preservationScore ?? 100) < 70);
  assert.equal(passed.receipt.mode, 'REBUILD');
  assert.equal(passed.receipt.preservationBypass, true);
  assert.ok(Array.isArray(passed.receipt.replacementSentenceIds));
  assert.ok((passed.receipt.replacementSentenceIds?.length ?? 0) > 0);
  assert.equal(passed.deterministicArtifact?.verificationKind, 'rebuild');
  assert.equal(prepareLifecycle(passed.deterministicArtifact!, passed.lifecycleBinding!, passed.receipt, 'normal', ['action_change']).artifact.status, 'needs_semantic_review');
  assert.equal(verifyRebuildWithCopySpec(draft, rebuilt, profile, copySpec).passed, true);
  const missingClaim = evaluate(task, { version: '1', mode: 'REBUILD', taskFingerprint: task.fingerprint, candidate: 'Operators should delay the launch indefinitely.' }, reduction);
  assert.equal(missingClaim.status, 'needs_escalation');
  const hygiene = evaluate(task, { version: '1', mode: 'REBUILD', taskFingerprint: task.fingerprint, candidate: `${rebuilt}\u200B` }, reduction);
  assert.equal(hygiene.status, 'needs_escalation');
  assert.equal(hygiene.candidate, undefined);
  assert.equal(hygiene.verification?.finalOutput.accepted, false);
  const cleaned = evaluate(task, { version: '1', mode: 'REBUILD', taskFingerprint: task.fingerprint, candidate: `${rebuilt}\u0007` }, reduction);
  assert.equal(cleaned.status, 'needs_semantic_review');
  assert.equal(cleaned.candidate, rebuilt);
  assert.equal(cleaned.verification?.finalOutput.changed, true);
  assert.equal(cleaned.deterministicArtifact?.candidateHash, createHash('sha256').update(rebuilt).digest('hex'));
});

test('rebuild disagreement cannot record accepted learning', () => {
  const reduction = rebuildRecommendation();
  const task = prepareRebuildTask(draft, profile, reduction, copySpec, capability(reduction), trustStore, 150);
  const failed = evaluate(task, { version: '1', mode: 'REBUILD', taskFingerprint: task.fingerprint, candidate: 'Operators should delay the launch indefinitely.' }, reduction);
  assert.equal(failed.status, 'needs_escalation');
  const evaluated = evaluate(task, { version: '1', mode: 'REBUILD', taskFingerprint: task.fingerprint, candidate: rebuilt }, reduction);
  assert.equal(evaluated.status, 'needs_semantic_review');
  const standard = verifyDeterministically(draft, rebuilt, profile, copySpec);
  assert.notEqual(standard.artifact.artifactFingerprint, evaluated.deterministicArtifact?.artifactFingerprint);
  assert.throws(() => recordApprovedLearning({
    ready: { version: '1', status: 'ready_for_human_review', artifactFingerprint: '1'.repeat(64), transitionFingerprint: '2'.repeat(64), binding: evaluated.lifecycleBinding!, semanticPolicy: 'normal', semanticTaskFingerprint: '3'.repeat(64), semanticEvidenceScopeFingerprint: '4'.repeat(64), verdictFingerprints: [] },
    approved: { version: '1', status: 'approved', artifactFingerprint: '5'.repeat(64), transitionFingerprint: '6'.repeat(64), binding: evaluated.lifecycleBinding!, semanticPolicy: 'normal', semanticTaskFingerprint: '3'.repeat(64), semanticEvidenceScopeFingerprint: '4'.repeat(64), verdictFingerprints: [] },
    decision: { evaluatorId: 'human.1', decision: 'approve' },
    capability: capability(reduction),
    source: draft,
    candidate: rebuilt,
    profile,
    context: { now: 150, trustStore, authorizedSemanticEvaluatorIds: { normal: [], highAssurance: [] }, authorizedHumanFinalizerIds: ['human.1'] },
    copySpec,
  }), /Invalid lifecycle artifact|Approved learning is not authorized|does not match deterministic verification/);
});

test('CLI and MCP rebuild helpers share fingerprints', () => {
  const reduction = rebuildRecommendation();
  const task = prepareRebuildTask(draft, profile, reduction, copySpec, capability(reduction), trustStore, 150);
  const parsed = parseRebuildTask(JSON.parse(JSON.stringify(task)));
  assert.equal(parsed.fingerprint, task.fingerprint);
  assert.equal(parsed.authorizationFingerprint, task.authorizationFingerprint);
  assert.match(task.prompt, /whole-document candidate/);
  const briefTask = prepareRebuildTask(draft, profile, reduction, copySpec, capability(reduction, { nonce: 'nonce-brief' }), trustStore, 150, {
    version: '1', audience: 'operators', intent: 'explain', format: 'outreach',
  });
  assert.match(briefTask.prompt, /# WritingBrief/);
  assert.equal(HYV_VERSION, '3.3.5');
});

test('apply rejects forged tasks, missing capability, and substituted profiles', () => {
  const reduction = rebuildRecommendation();
  const task = prepareRebuildTask(draft, profile, reduction, copySpec, capability(reduction), trustStore, 150);
  const response = { version: '1' as const, mode: 'REBUILD' as const, taskFingerprint: task.fingerprint, candidate: rebuilt };
  const { fingerprint: _ignored, ...base } = task;
  const forgedBase = { ...base, authorizationFingerprint: 'a'.repeat(64) };
  const forged = { ...forgedBase, fingerprint: createHash('sha256').update(canonicalJson(forgedBase)).digest('hex') };
  assert.equal(parseRebuildTask(forged).fingerprint, forged.fingerprint);
  assert.throws(() => evaluateRebuildResponse(forged, { ...response, taskFingerprint: forged.fingerprint }, profile, capability(reduction), trustStore, 150), /Rebuild authorization is invalid/);
  assert.throws(() => evaluateRebuildResponse(task, response, profile, {}, trustStore, 150), /Rebuild authorization is invalid/);
  const other = buildProfile(['I speak in a different register altogether.', 'I keep every sentence longer than the first profile would.'], ['mechanism']);
  assert.throws(() => evaluate(task, response, reduction, other), /Rebuild profile binding does not match this task/);
});

test('meaning-first rebuild binds the residual policy and blocks carried-over wording', () => {
  const source = 'The operating review keeps the launch checklist small and the handoff calm. The launch is on 14 August.';
  const reduction = rebuildRecommendation(source);
  const task = prepareRebuildTask(source, profile, reduction, copySpec, capability(reduction, {}, source), trustStore, 150, undefined, recompositionPolicy);
  assert.doesNotMatch(task.prompt, /The operating review keeps the launch checklist/);
  assert.match(task.prompt, /Meaning-first recomposition contract/);
  const repeated = evaluateRebuildResponse(task, { version: '1', mode: 'REBUILD', taskFingerprint: task.fingerprint, candidate: source }, profile, capability(reduction, {}, source), trustStore, 150);
  assert.equal(repeated.status, 'needs_escalation');
  assert.equal(repeated.failures[0]?.code, 'lexical_residual_exceeds_policy');
  assert.equal(repeated.receipt.lexicalResidual?.passed, false);
  assert.equal(repeated.candidate, undefined);
  const fresh = evaluateRebuildResponse(task, { version: '1', mode: 'REBUILD', taskFingerprint: task.fingerprint, candidate: 'Release owners now work from a compact calendar note. The launch is on 14 August. Nothing else in this message repeats the original framing.' }, profile, capability(reduction, {}, source), trustStore, 150);
  assert.equal(fresh.status, 'needs_semantic_review');
  assert.equal(fresh.receipt.lexicalResidual?.passed, true);
});

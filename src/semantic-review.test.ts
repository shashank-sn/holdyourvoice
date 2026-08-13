import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import type { ApprovalCapabilityClaimsV1, ApprovalTrustStoreV1, DeterministicVerificationArtifactV1, RewriteLifecycleBindingV1, SemanticReviewTaskV1 } from './contracts.js';
import { canonicalJson, canonicalJsonBytes } from './canonical-json.js';
import { createInitialLifecycleArtifact, parseSemanticVerdict, prepareSemanticReviewTask, reduceRewriteLifecycle, reviewSemanticVerdicts } from './semantic-review.js';

const deterministicBase = { version: '1' as const, verificationKind: 'standard' as const, passed: true, analysisVersion: '2', rulesetVersion: '3.2.0', preservationMetricVersion: 'legacy-set-v1' as const, preservationScore: 100, sourceHash: '4'.repeat(64), candidateHash: '5'.repeat(64), profileId: 'founder.primary', profileRevisionDigest: '6'.repeat(64), regressionKeys: [] };
const deterministicFingerprint = createHash('sha256').update(`hyv:deterministic-verification:v1\0${canonicalJson(deterministicBase)}`).digest('hex');
const binding: RewriteLifecycleBindingV1 = { rewriteTaskFingerprint: '1'.repeat(64), rewriteResponseFingerprint: '2'.repeat(64), deterministicArtifactFingerprint: deterministicFingerprint, sourceHash: deterministicBase.sourceHash, candidateHash: deterministicBase.candidateHash, profileId: deterministicBase.profileId, profileRevisionDigest: deterministicBase.profileRevisionDigest, rulesetVersion: deterministicBase.rulesetVersion, schemaVersion: '1' };
const receipt = { version: '1' as const, taskFingerprint: binding.rewriteTaskFingerprint, responseFingerprint: binding.rewriteResponseFingerprint, adapterIds: [], replacementSentenceIds: [3, 1] };
function task(policy: 'normal' | 'high_assurance' = 'normal'): SemanticReviewTaskV1 { return prepareSemanticReviewTask(binding, policy, receipt, ['action_change']); }
function deterministic(passed = true): DeterministicVerificationArtifactV1 { const base = { ...deterministicBase, passed }; return { ...base, artifactFingerprint: createHash('sha256').update(`hyv:deterministic-verification:v1\0${canonicalJson(base)}`).digest('hex') }; }
const emptyTrust: ApprovalTrustStoreV1 = { version: '1', audience: '@holdyourvoice/hyv', maxCapabilityLifetimeSeconds: 300, keys: [] };
const context = { now: 150, trustStore: emptyTrust, authorizedSemanticEvaluatorIds: { normal: ['one'], highAssurance: ['one', 'two', 'three'] }, authorizedHumanFinalizerIds: ['human-1'] };

test('preserves the version 3.2 semantic aggregation API', () => {
  const verdicts = ['one', 'two', 'three'].map((id) => parseSemanticVerdict(id, { approved: true, violations: [] }));
  assert.equal(reviewSemanticVerdicts(verdicts).status, 'accepted');
});

test('normal review clears with one clean authorized verdict and rejection escalates', () => {
  const reviewTask = task(); const initial = createInitialLifecycleArtifact(reviewTask, deterministic());
  const clean = parseSemanticVerdict(reviewTask, 'one', { approved: true, violations: [] });
  const cleared = reduceRewriteLifecycle(initial, { version: '1', type: 'semantic_submission', parentArtifactFingerprint: initial.artifactFingerprint, taskFingerprint: reviewTask.taskFingerprint, verdicts: [clean] }, context);
  assert.equal(cleared.ok && cleared.artifact.status, 'ready_for_human_review');
  const rejected = parseSemanticVerdict(reviewTask, 'one', { approved: false, violations: ['action_change'] });
  const escalated = reduceRewriteLifecycle(initial, { version: '1', type: 'semantic_submission', parentArtifactFingerprint: initial.artifactFingerprint, taskFingerprint: reviewTask.taskFingerprint, verdicts: [rejected] }, context);
  assert.equal(escalated.ok && escalated.artifact.status, 'needs_escalation');
});

test('high assurance is permutation-stable and requires three configured evaluators', () => {
  const reviewTask = task('high_assurance'); const initial = createInitialLifecycleArtifact(reviewTask, deterministic());
  const verdicts = ['three', 'one', 'two'].map((id) => parseSemanticVerdict(reviewTask, id, { approved: true, violations: [] }));
  const action = { version: '1' as const, type: 'semantic_submission' as const, parentArtifactFingerprint: initial.artifactFingerprint, taskFingerprint: reviewTask.taskFingerprint, verdicts };
  const left = reduceRewriteLifecycle(initial, action, context);
  const right = reduceRewriteLifecycle(initial, { ...action, verdicts: [...verdicts].reverse() }, context);
  assert.deepEqual(left, right);
  assert.deepEqual(reduceRewriteLifecycle(initial, { ...action, verdicts: verdicts.slice(0, 2) }, context), { ok: false, error: 'invalid_verdict_count' });
});

test('enforces replay, parent order, terminal states, bindings, and evaluator authority', () => {
  const reviewTask = task(); const initial = createInitialLifecycleArtifact(reviewTask, deterministic());
  const action = { version: '1' as const, type: 'semantic_submission' as const, parentArtifactFingerprint: initial.artifactFingerprint, taskFingerprint: reviewTask.taskFingerprint, verdicts: [parseSemanticVerdict(reviewTask, 'one', { approved: true, violations: [] })] };
  const next = reduceRewriteLifecycle(initial, action, context); assert.equal(next.ok, true); if (!next.ok) return;
  assert.strictEqual(reduceRewriteLifecycle(next.artifact, action, context).ok, true);
  assert.deepEqual(reduceRewriteLifecycle(next.artifact, { ...action, verdicts: [parseSemanticVerdict(reviewTask, 'one', { approved: false, violations: ['action_change'] })] }, context), { ok: false, error: 'conflicting_replay' });
  assert.deepEqual(reduceRewriteLifecycle(initial, { ...action, parentArtifactFingerprint: '9'.repeat(64) }, context), { ok: false, error: 'stale_parent' });
  assert.deepEqual(reduceRewriteLifecycle(initial, { ...action, verdicts: [parseSemanticVerdict(reviewTask, 'unknown', { approved: true, violations: [] })] }, context), { ok: false, error: 'evaluator_not_authorized' });
  const terminal = reduceRewriteLifecycle(createInitialLifecycleArtifact(reviewTask, deterministic()), { ...action, verdicts: [parseSemanticVerdict(reviewTask, 'one', { approved: false, violations: ['action_change'] })] }, context);
  if (terminal.ok) assert.deepEqual(reduceRewriteLifecycle(terminal.artifact, { ...action, parentArtifactFingerprint: terminal.artifact.artifactFingerprint }, context), { ok: false, error: 'terminal_state' });
});

test('authorized human rejection escalates; approval requires a valid external capability', () => {
  const reviewTask = task(); const initial = createInitialLifecycleArtifact(reviewTask, deterministic());
  const semantic = reduceRewriteLifecycle(initial, { version: '1', type: 'semantic_submission', parentArtifactFingerprint: initial.artifactFingerprint, taskFingerprint: reviewTask.taskFingerprint, verdicts: [parseSemanticVerdict(reviewTask, 'one', { approved: true, violations: [] })] }, context);
  assert.equal(semantic.ok, true); if (!semantic.ok) return;
  const approvalBase = { version: '1' as const, judgmentType: 'human_finalization' as const, parentArtifactFingerprint: semantic.artifact.artifactFingerprint, binding, evaluatorId: 'human-1', evidenceScope: { kind: 'candidate' as const }, decision: 'approve' as const };
  assert.deepEqual(reduceRewriteLifecycle(semantic.artifact, { version: '1', type: 'human_finalization', parentArtifactFingerprint: semantic.artifact.artifactFingerprint, finalization: approvalBase }, context), { ok: false, error: 'capability_required' });
  assert.deepEqual(reduceRewriteLifecycle(semantic.artifact, { version: '1', type: 'human_finalization', parentArtifactFingerprint: semantic.artifact.artifactFingerprint, finalization: { ...approvalBase, capability: { payload: 'bad', signature: 'bad' } } }, context), { ok: false, error: 'capability_invalid' });
  const rejection = reduceRewriteLifecycle(semantic.artifact, { version: '1', type: 'human_finalization', parentArtifactFingerprint: semantic.artifact.artifactFingerprint, finalization: { version: '1', judgmentType: 'human_finalization', parentArtifactFingerprint: semantic.artifact.artifactFingerprint, binding, evaluatorId: 'human-1', evidenceScope: { kind: 'candidate' }, decision: 'reject' } }, context);
  assert.equal(rejection.ok && rejection.artifact.status, 'needs_escalation');

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const trustStore: ApprovalTrustStoreV1 = { version: '1', audience: '@holdyourvoice/hyv', maxCapabilityLifetimeSeconds: 300, keys: [{ issuer: 'host', keyId: 'k1', publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'), status: 'active' }] };
  const claims: ApprovalCapabilityClaimsV1 = { version: '1', purpose: 'hyv.final-approval', issuer: 'host', audience: '@holdyourvoice/hyv', subjectArtifactFingerprint: semantic.artifact.artifactFingerprint, sourceHash: binding.sourceHash, candidateHash: binding.candidateHash, profileId: binding.profileId, profileRevisionDigest: binding.profileRevisionDigest, keyId: 'k1', issuedAt: 100, notBefore: 100, expiresAt: 200, nonce: 'nonce' };
  const payload = canonicalJsonBytes(claims); const capability = { payload: payload.toString('base64url'), signature: sign(null, payload, privateKey).toString('base64url') };
  const approved = reduceRewriteLifecycle(semantic.artifact, { version: '1', type: 'human_finalization', parentArtifactFingerprint: semantic.artifact.artifactFingerprint, finalization: { version: '1', judgmentType: 'human_finalization', parentArtifactFingerprint: semantic.artifact.artifactFingerprint, binding, evaluatorId: 'human-1', evidenceScope: { kind: 'candidate' }, decision: 'approve', capability } }, { ...context, trustStore });
  assert.equal(approved.ok && approved.artifact.status, 'approved');
  assert.doesNotMatch(JSON.stringify(approved), /nonce|payload|signature/);
});

test('failed deterministic verification cannot create an initial lifecycle artifact', () => {
  assert.throws(() => createInitialLifecycleArtifact(task(), deterministic(false)), /passed deterministic verification/);
  const reviewTask = task();
  assert.throws(() => createInitialLifecycleArtifact({ ...reviewTask, evidenceScope: { sentenceIds: [99] } }, deterministic()), /passed deterministic verification/);
});

test('rejects oversized or deeply nested actions as invalid without throwing', () => {
  const reviewTask = task(); const initial = createInitialLifecycleArtifact(reviewTask, deterministic());
  const verdict = parseSemanticVerdict(reviewTask, 'one', { approved: true, violations: [] });
  const oversized = { version: '1', type: 'semantic_submission', parentArtifactFingerprint: initial.artifactFingerprint, taskFingerprint: reviewTask.taskFingerprint, verdicts: Array.from({ length: 1000 }, () => verdict) };
  assert.deepEqual(reduceRewriteLifecycle(initial, oversized, context), { ok: false, error: 'invalid_action' });
  let nested: unknown = 'x'; for (let index = 0; index < 70; index += 1) nested = [nested];
  assert.deepEqual(reduceRewriteLifecycle(initial, { ...oversized, verdicts: [{ ...verdict, binding: nested }] }, context), { ok: false, error: 'invalid_action' });
  const malformedFinalization = { version: '1', type: 'human_finalization', parentArtifactFingerprint: initial.artifactFingerprint, finalization: { version: '1', judgmentType: 'human_finalization', parentArtifactFingerprint: initial.artifactFingerprint, binding, evaluatorId: 'human-1', evidenceScope: null, decision: 'reject' } };
  assert.deepEqual(reduceRewriteLifecycle(initial, malformedFinalization, context), { ok: false, error: 'invalid_action' });
});

test('semantic submissions reject changed task, binding, and evidence scope', () => {
  const reviewTask = task(); const initial = createInitialLifecycleArtifact(reviewTask, deterministic());
  const verdict = parseSemanticVerdict(reviewTask, 'one', { approved: true, violations: [] });
  const base = { version: '1' as const, type: 'semantic_submission' as const, parentArtifactFingerprint: initial.artifactFingerprint, taskFingerprint: reviewTask.taskFingerprint, verdicts: [verdict] };
  assert.deepEqual(reduceRewriteLifecycle(initial, { ...base, taskFingerprint: '9'.repeat(64) }, context), { ok: false, error: 'task_fingerprint_mismatch' });
  assert.deepEqual(reduceRewriteLifecycle(initial, { ...base, verdicts: [{ ...verdict, binding: { ...binding, candidateHash: '9'.repeat(64) } }] }, context), { ok: false, error: 'invalid_binding' });
  assert.deepEqual(reduceRewriteLifecycle(initial, { ...base, verdicts: [{ ...verdict, evidenceScope: { sentenceIds: [99] } }] }, context), { ok: false, error: 'evidence_scope_mismatch' });
});

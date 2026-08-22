import { createHash } from 'node:crypto';
import type { DeterministicVerificationArtifactV1, LifecycleError, RewriteLifecycleActionV1, RewriteLifecycleArtifactV1, RewriteLifecycleBindingV1, RewriteLifecycleContextV1, RewriteReceipt, SemanticPolicy, SemanticReview, SemanticReviewTaskV1, SemanticVerdict, SemanticVerdictV1, SemanticViolation } from './contracts.js';
import { canonicalJson } from './canonical-json.js';
import { verifyApprovalCapability } from './approval-capability.js';
import { exactKeys as exact, isPlainObject as plain } from './internal.js';

const violations = new Set<SemanticViolation>(['action_change', 'dropped_object', 'unsupported_claim', 'constraint_weakened', 'clarity_regression']);
const HEX = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function hash(domain: string, value: unknown): string { return createHash('sha256').update(`${domain}\0`).update(canonicalJson(value)).digest('hex'); }
function same(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }
function bindingValid(binding: RewriteLifecycleBindingV1): boolean {
  return binding.schemaVersion === '1' && [binding.rewriteTaskFingerprint, binding.rewriteResponseFingerprint, binding.deterministicArtifactFingerprint, binding.sourceHash, binding.candidateHash].every((item) => HEX.test(item))
    && ID.test(binding.profileId) && ID.test(binding.profileRevisionDigest) && ID.test(binding.rulesetVersion);
}

export function prepareSemanticReviewTask(binding: RewriteLifecycleBindingV1, policy: SemanticPolicy, receipt: RewriteReceipt, allowedViolations: SemanticViolation[]): SemanticReviewTaskV1 {
  if (!bindingValid(binding) || !['normal', 'high_assurance'].includes(policy)) throw new Error('Semantic review task has an invalid binding or policy.');
  if (receipt.taskFingerprint !== binding.rewriteTaskFingerprint || receipt.responseFingerprint !== binding.rewriteResponseFingerprint || !Array.isArray(receipt.replacementSentenceIds)) throw new Error('Semantic review task requires its bound rewrite receipt.');
  const evidenceScope = { sentenceIds: [...new Set(receipt.replacementSentenceIds)].sort((left, right) => left - right) };
  if (evidenceScope.sentenceIds.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(allowedViolations).size !== allowedViolations.length || allowedViolations.some((item) => !violations.has(item))) throw new Error('Semantic review task has invalid evidence scope or violations.');
  const base = { version: '1' as const, judgmentType: 'semantic' as const, binding, policy, evidenceScope, allowedViolations: [...allowedViolations].sort() };
  return { ...base, taskFingerprint: hash('hyv:semantic-task:v1', base) };
}

export function isValidSemanticReviewTask(task: SemanticReviewTaskV1): boolean {
  try {
    if (!plain(task) || !exact(task as unknown as Record<string, unknown>, ['version', 'judgmentType', 'binding', 'policy', 'evidenceScope', 'allowedViolations', 'taskFingerprint'])
      || task.version !== '1' || task.judgmentType !== 'semantic' || !bindingValid(task.binding) || !['normal', 'high_assurance'].includes(task.policy)
      || !plain(task.evidenceScope) || !exact(task.evidenceScope as unknown as Record<string, unknown>, ['sentenceIds']) || !Array.isArray(task.evidenceScope.sentenceIds)
      || task.evidenceScope.sentenceIds.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(task.evidenceScope.sentenceIds).size !== task.evidenceScope.sentenceIds.length
      || !Array.isArray(task.allowedViolations) || task.allowedViolations.some((item) => !violations.has(item)) || new Set(task.allowedViolations).size !== task.allowedViolations.length) return false;
    const { taskFingerprint, ...base } = task;
    return taskFingerprint === hash('hyv:semantic-task:v1', base);
  } catch { return false; }
}

export function parseSemanticVerdict(evaluatorId: string, value: unknown): SemanticVerdict;
export function parseSemanticVerdict(task: SemanticReviewTaskV1, evaluatorId: string, value: unknown): SemanticVerdictV1;
export function parseSemanticVerdict(taskOrEvaluatorId: SemanticReviewTaskV1 | string, evaluatorIdOrValue: string | unknown, maybeValue?: unknown): SemanticVerdictV1 | SemanticVerdict {
  if (typeof taskOrEvaluatorId === 'string') {
    const raw = evaluatorIdOrValue as Record<string, unknown>;
    if (!plain(raw) || typeof raw.approved !== 'boolean' || !Array.isArray(raw.violations) || raw.violations.some((item) => typeof item !== 'string' || !violations.has(item as SemanticViolation))) throw new Error('Semantic evaluator response must include approved and known violations.');
    return { evaluatorId: taskOrEvaluatorId, approved: raw.approved, violations: raw.violations as SemanticViolation[] };
  }
  const task = taskOrEvaluatorId; const evaluatorId = evaluatorIdOrValue as string; const value = maybeValue;
  if (!isValidSemanticReviewTask(task) || !ID.test(evaluatorId) || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Semantic evaluator response must be a bounded object.');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !['approved', 'violations'].includes(key)) || typeof raw.approved !== 'boolean' || !Array.isArray(raw.violations)
    || raw.violations.some((item) => typeof item !== 'string' || !violations.has(item as SemanticViolation) || !task.allowedViolations.includes(item as SemanticViolation)) || new Set(raw.violations).size !== raw.violations.length
    || (raw.approved && raw.violations.length !== 0) || (!raw.approved && raw.violations.length === 0)) throw new Error('Semantic evaluator response contradicts its known violations.');
  return { version: '1', judgmentType: 'semantic', taskFingerprint: task.taskFingerprint, binding: task.binding, evidenceScope: task.evidenceScope, evaluatorId, approved: raw.approved, violations: raw.violations as SemanticViolation[] };
}

export function reviewSemanticVerdicts(verdicts: SemanticVerdict[]): SemanticReview {
  const ids = new Set(verdicts.map((verdict) => verdict.evaluatorId));
  if (verdicts.length !== 3 || ids.size !== 3) return { status: 'needs_escalation', verdicts, reason: 'insufficient_evaluators' };
  if (verdicts.every((verdict) => verdict.approved && verdict.violations.length === 0)) return { status: 'accepted', verdicts };
  if (verdicts.some((verdict) => verdict.approved)) return { status: 'needs_escalation', verdicts, reason: 'evaluator_disagreement' };
  return { status: 'needs_escalation', verdicts, reason: 'semantic_violation' };
}

function artifact(base: Omit<RewriteLifecycleArtifactV1, 'artifactFingerprint'>): RewriteLifecycleArtifactV1 {
  return { ...base, artifactFingerprint: hash('hyv:lifecycle-artifact:v1', base) };
}

export function isValidLifecycleArtifact(value: RewriteLifecycleArtifactV1): boolean {
  if (!plain(value) || value.version !== '1' || !['needs_semantic_review', 'ready_for_human_review', 'approved', 'needs_escalation'].includes(value.status) || !bindingValid(value.binding) || !['normal', 'high_assurance'].includes(value.semanticPolicy)
    || !HEX.test(value.transitionFingerprint) || !HEX.test(value.semanticTaskFingerprint) || !HEX.test(value.semanticEvidenceScopeFingerprint)
    || !Array.isArray(value.verdictFingerprints) || value.verdictFingerprints.some((item) => !HEX.test(item)) || new Set(value.verdictFingerprints).size !== value.verdictFingerprints.length) return false;
  const requiredKeys = ['version', 'status', 'artifactFingerprint', 'transitionFingerprint', 'binding', 'semanticPolicy', 'semanticTaskFingerprint', 'semanticEvidenceScopeFingerprint', 'verdictFingerprints'];
  const optionalKeys = ['parentArtifactFingerprint', 'capabilityFingerprint', 'reason'];
  if (!exact(value as unknown as Record<string, unknown>, requiredKeys, optionalKeys)) return false;
  const requiredVerdicts = value.semanticPolicy === 'normal' ? 1 : 3;
  if (value.status === 'needs_semantic_review' && (value.parentArtifactFingerprint !== undefined || value.verdictFingerprints.length !== 0 || value.capabilityFingerprint !== undefined || value.reason !== undefined)) return false;
  if (value.status === 'ready_for_human_review' && (!value.parentArtifactFingerprint || !HEX.test(value.parentArtifactFingerprint) || value.verdictFingerprints.length !== requiredVerdicts || value.capabilityFingerprint !== undefined || value.reason !== undefined)) return false;
  if (value.status === 'approved' && (!value.parentArtifactFingerprint || !HEX.test(value.parentArtifactFingerprint) || value.verdictFingerprints.length !== requiredVerdicts || !value.capabilityFingerprint || !HEX.test(value.capabilityFingerprint) || value.reason !== undefined)) return false;
  if (value.status === 'needs_escalation' && (!value.parentArtifactFingerprint || !HEX.test(value.parentArtifactFingerprint) || !value.reason || !['semantic_rejection', 'semantic_disagreement', 'human_rejection'].includes(value.reason) || value.verdictFingerprints.length !== requiredVerdicts || value.capabilityFingerprint !== undefined)) return false;
  const { artifactFingerprint, ...base } = value;
  return HEX.test(artifactFingerprint) && artifactFingerprint === hash('hyv:lifecycle-artifact:v1', base);
}

export function createInitialLifecycleArtifact(task: SemanticReviewTaskV1, deterministic: DeterministicVerificationArtifactV1): RewriteLifecycleArtifactV1 {
  const { taskFingerprint, ...taskBase } = task;
  const { artifactFingerprint, ...deterministicBase } = deterministic;
  const expectedDeterministicFingerprint = createHash('sha256').update(`hyv:deterministic-verification:v1\0${canonicalJson(deterministicBase)}`).digest('hex');
  if (taskFingerprint !== hash('hyv:semantic-task:v1', taskBase) || !deterministic.passed || artifactFingerprint !== expectedDeterministicFingerprint || deterministic.artifactFingerprint !== task.binding.deterministicArtifactFingerprint || deterministic.sourceHash !== task.binding.sourceHash || deterministic.candidateHash !== task.binding.candidateHash || deterministic.profileId !== task.binding.profileId || deterministic.profileRevisionDigest !== task.binding.profileRevisionDigest || deterministic.rulesetVersion !== task.binding.rulesetVersion) throw new Error('Lifecycle creation requires its bound passed deterministic verification artifact.');
  return artifact({ version: '1', status: 'needs_semantic_review', transitionFingerprint: hash('hyv:lifecycle-initial:v1', { binding: task.binding, semanticPolicy: task.policy }), binding: task.binding, semanticPolicy: task.policy, semanticTaskFingerprint: task.taskFingerprint, semanticEvidenceScopeFingerprint: hash('hyv:semantic-evidence-scope:v1', task.evidenceScope), verdictFingerprints: [] });
}

export type LifecycleReductionResult = { ok: true; artifact: RewriteLifecycleArtifactV1 } | { ok: false; error: LifecycleError };
function fail(error: LifecycleError): LifecycleReductionResult { return { ok: false, error }; }

function normalizeAction(value: unknown): RewriteLifecycleActionV1 | undefined {
  if (!plain(value) || value.version !== '1' || typeof value.parentArtifactFingerprint !== 'string' || !HEX.test(value.parentArtifactFingerprint)) return undefined;
  const action = value as unknown as RewriteLifecycleActionV1;
  if (action.type === 'semantic_submission') {
    if (!exact(value, ['version', 'type', 'parentArtifactFingerprint', 'taskFingerprint', 'verdicts']) || !HEX.test(action.taskFingerprint) || !Array.isArray(action.verdicts) || action.verdicts.length < 1 || action.verdicts.length > 3) return undefined;
    for (const verdict of action.verdicts) {
      if (!verdict || typeof verdict !== 'object' || !exact(verdict as unknown as Record<string, unknown>, ['version', 'judgmentType', 'taskFingerprint', 'binding', 'evidenceScope', 'evaluatorId', 'approved', 'violations']) || verdict.version !== '1' || verdict.judgmentType !== 'semantic' || !ID.test(verdict.evaluatorId) || typeof verdict.approved !== 'boolean' || !Array.isArray(verdict.violations) || verdict.violations.some((item) => !violations.has(item)) || new Set(verdict.violations).size !== verdict.violations.length) return undefined;
    }
    return { ...action, verdicts: [...action.verdicts].map((verdict) => ({ ...verdict, violations: [...verdict.violations].sort() })).sort((left, right) => left.evaluatorId < right.evaluatorId ? -1 : left.evaluatorId > right.evaluatorId ? 1 : 0) };
  }
  if (action.type === 'human_finalization' && exact(action as unknown as Record<string, unknown>, ['version', 'type', 'parentArtifactFingerprint', 'finalization']) && action.finalization?.version === '1') {
    const finalization = action.finalization as unknown as Record<string, unknown>;
    if (!plain(finalization) || !exact(finalization, ['version', 'judgmentType', 'parentArtifactFingerprint', 'binding', 'evaluatorId', 'evidenceScope', 'decision'], ['capability']) || action.finalization.judgmentType !== 'human_finalization' || !ID.test(action.finalization.evaluatorId) || !HEX.test(action.finalization.parentArtifactFingerprint) || !bindingValid(action.finalization.binding) || !plain(action.finalization.evidenceScope) || !exact(action.finalization.evidenceScope, ['kind']) || action.finalization.evidenceScope.kind !== 'candidate' || !['approve', 'reject'].includes(action.finalization.decision)) return undefined;
    return action;
  }
  return undefined;
}

export function reduceRewriteLifecycle(current: RewriteLifecycleArtifactV1, rawAction: unknown, context: RewriteLifecycleContextV1): LifecycleReductionResult {
  let action: RewriteLifecycleActionV1 | undefined;
  let transitionFingerprint: string;
  try { action = normalizeAction(rawAction); if (!action) return fail('invalid_action'); transitionFingerprint = hash('hyv:lifecycle-transition:v1', action); }
  catch { return fail('invalid_action'); }
  if (current.transitionFingerprint === transitionFingerprint) return { ok: true, artifact: current };
  if (action.parentArtifactFingerprint === current.parentArtifactFingerprint) return fail('conflicting_replay');
  if (action.parentArtifactFingerprint !== current.artifactFingerprint) return fail('stale_parent');
  if (current.status === 'approved' || current.status === 'needs_escalation') return fail('terminal_state');

  if (action.type === 'semantic_submission') {
    if (current.status !== 'needs_semantic_review') return fail('out_of_order_transition');
    const required = current.semanticPolicy === 'normal' ? 1 : 3;
    if (action.verdicts.length !== required) return fail('invalid_verdict_count');
    const ids = action.verdicts.map((verdict) => verdict.evaluatorId); if (new Set(ids).size !== ids.length) return fail('duplicate_evaluator');
    const authorized = current.semanticPolicy === 'normal' ? context.authorizedSemanticEvaluatorIds.normal : context.authorizedSemanticEvaluatorIds.highAssurance;
    if (current.semanticPolicy === 'high_assurance' && new Set(authorized).size < 3) return fail('invalid_verdict_count');
    if (ids.some((id) => !authorized.includes(id))) return fail('evaluator_not_authorized');
    for (const verdict of action.verdicts) {
      if (action.taskFingerprint !== current.semanticTaskFingerprint || verdict.taskFingerprint !== action.taskFingerprint) return fail('task_fingerprint_mismatch');
      if (!same(verdict.binding, current.binding)) return fail('invalid_binding');
      if (verdict.judgmentType !== 'semantic' || hash('hyv:semantic-evidence-scope:v1', verdict.evidenceScope) !== current.semanticEvidenceScopeFingerprint) return fail('evidence_scope_mismatch');
      if ((verdict.approved && verdict.violations.length) || (!verdict.approved && !verdict.violations.length)) return fail('contradictory_verdict');
    }
    const verdictFingerprints = action.verdicts.map((verdict) => hash('hyv:semantic-verdict:v1', verdict));
    const approvals = action.verdicts.filter((verdict) => verdict.approved).length;
    const status = approvals === required ? 'ready_for_human_review' : 'needs_escalation';
    const reason = status === 'needs_escalation' ? (approvals === 0 ? 'semantic_rejection' : 'semantic_disagreement') : undefined;
    return { ok: true, artifact: artifact({ version: '1', status, parentArtifactFingerprint: current.artifactFingerprint, transitionFingerprint, binding: current.binding, semanticPolicy: current.semanticPolicy, semanticTaskFingerprint: current.semanticTaskFingerprint, semanticEvidenceScopeFingerprint: current.semanticEvidenceScopeFingerprint, verdictFingerprints, ...(reason ? { reason } : {}) }) };
  }

  if (current.status !== 'ready_for_human_review') return fail('out_of_order_transition');
  const finalization = action.finalization;
  if (finalization.parentArtifactFingerprint !== current.artifactFingerprint || !same(finalization.binding, current.binding) || finalization.judgmentType !== 'human_finalization' || finalization.evidenceScope.kind !== 'candidate') return fail('invalid_binding');
  if (!context.authorizedHumanFinalizerIds.includes(finalization.evaluatorId)) return fail('human_finalizer_not_authorized');
  if (finalization.decision === 'reject') return { ok: true, artifact: artifact({ version: '1', status: 'needs_escalation', parentArtifactFingerprint: current.artifactFingerprint, transitionFingerprint, binding: current.binding, semanticPolicy: current.semanticPolicy, semanticTaskFingerprint: current.semanticTaskFingerprint, semanticEvidenceScopeFingerprint: current.semanticEvidenceScopeFingerprint, verdictFingerprints: current.verdictFingerprints, reason: 'human_rejection' }) };
  if (!finalization.capability) return fail('capability_required');
  const capability = verifyApprovalCapability(finalization.capability, context.trustStore, { now: context.now, expectedSubjectArtifactFingerprint: current.artifactFingerprint, binding: current.binding, expectedPurpose: 'hyv.final-approval' });
  if (!capability.ok) return fail('capability_invalid');
  return { ok: true, artifact: artifact({ version: '1', status: 'approved', parentArtifactFingerprint: current.artifactFingerprint, transitionFingerprint, binding: current.binding, semanticPolicy: current.semanticPolicy, semanticTaskFingerprint: current.semanticTaskFingerprint, semanticEvidenceScopeFingerprint: current.semanticEvidenceScopeFingerprint, verdictFingerprints: current.verdictFingerprints, capabilityFingerprint: capability.capabilityFingerprint }) };
}

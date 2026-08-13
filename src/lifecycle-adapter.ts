import type { ApprovalCapabilityEnvelopeV1, CopySpec, DeterministicVerificationArtifactV1, LifecycleError, Profile, RewriteLifecycleArtifactV1, RewriteLifecycleBindingV1, RewriteLifecycleContextV1, RewriteReceipt, SemanticPolicy, SemanticReviewTaskV1, SemanticViolation, WritingBrief } from './contracts.js';
import { canonicalJson } from './canonical-json.js';
import { verifyApprovalCapability } from './approval-capability.js';
import { createInitialLifecycleArtifact, isValidLifecycleArtifact, parseSemanticVerdict, prepareSemanticReviewTask, reduceRewriteLifecycle, type LifecycleReductionResult } from './semantic-review.js';
import { verifyDeterministically } from './pipeline.js';
import { recordVerifiedCandidate, type LearningCaptureStatus } from './learning.js';

export function prepareLifecycle(
  deterministic: DeterministicVerificationArtifactV1,
  binding: RewriteLifecycleBindingV1,
  receipt: RewriteReceipt,
  policy: SemanticPolicy,
  allowedViolations: SemanticViolation[],
): { task: SemanticReviewTaskV1; artifact: RewriteLifecycleArtifactV1 } {
  const task = prepareSemanticReviewTask(binding, policy, receipt, allowedViolations);
  return { task, artifact: createInitialLifecycleArtifact(task, deterministic) };
}

export function submitSemanticVerdict(
  artifact: RewriteLifecycleArtifactV1,
  task: SemanticReviewTaskV1,
  evaluatorId: string,
  verdict: unknown,
  context: RewriteLifecycleContextV1,
): LifecycleReductionResult {
  try { inspectLifecycle(artifact); } catch { return { ok: false, error: 'invalid_action' }; }
  const parsed = parseSemanticVerdict(task, evaluatorId, verdict);
  return reduceRewriteLifecycle(artifact, {
    version: '1', type: 'semantic_submission', parentArtifactFingerprint: artifact.artifactFingerprint,
    taskFingerprint: task.taskFingerprint, verdicts: [parsed],
  }, context);
}

export interface LifecycleInspection {
  version: '1';
  status: RewriteLifecycleArtifactV1['status'];
  artifactFingerprint: string;
  parentArtifactFingerprint?: string;
  transitionFingerprint: string;
  semanticPolicy: SemanticPolicy;
  semanticTaskFingerprint: string;
  semanticEvidenceScopeFingerprint: string;
  verdictFingerprints: string[];
  capabilityFingerprint?: string;
  reason?: RewriteLifecycleArtifactV1['reason'];
}

export function inspectLifecycle(artifact: RewriteLifecycleArtifactV1): LifecycleInspection {
  if (!artifact || artifact.version !== '1' || !isValidLifecycleArtifact(artifact)) throw new Error('Invalid lifecycle artifact.');
  return {
    version: '1', status: artifact.status, artifactFingerprint: artifact.artifactFingerprint,
    ...(artifact.parentArtifactFingerprint ? { parentArtifactFingerprint: artifact.parentArtifactFingerprint } : {}),
    transitionFingerprint: artifact.transitionFingerprint, semanticPolicy: artifact.semanticPolicy,
    semanticTaskFingerprint: artifact.semanticTaskFingerprint,
    semanticEvidenceScopeFingerprint: artifact.semanticEvidenceScopeFingerprint,
    verdictFingerprints: [...artifact.verdictFingerprints],
    ...(artifact.capabilityFingerprint ? { capabilityFingerprint: artifact.capabilityFingerprint } : {}),
    ...(artifact.reason ? { reason: artifact.reason } : {}),
  };
}

export function validateFinalApproval(artifact: RewriteLifecycleArtifactV1, capability: unknown, context: RewriteLifecycleContextV1): { ok: true; capabilityFingerprint: string } | { ok: false; error: 'capability_invalid' } {
  try {
    inspectLifecycle(artifact);
    const result = verifyApprovalCapability(capability, context.trustStore, { now: context.now, expectedSubjectArtifactFingerprint: artifact.artifactFingerprint, binding: artifact.binding, expectedPurpose: 'hyv.final-approval' });
    return result.ok ? result : { ok: false, error: 'capability_invalid' };
  } catch { return { ok: false, error: 'capability_invalid' }; }
}

export function finalizeLifecycle(
  artifact: RewriteLifecycleArtifactV1,
  decision: { evaluatorId: string; decision: 'approve' | 'reject' },
  context: RewriteLifecycleContextV1,
  capability?: ApprovalCapabilityEnvelopeV1,
): LifecycleReductionResult {
  try { inspectLifecycle(artifact); } catch { return { ok: false, error: 'invalid_action' as LifecycleError }; }
  return reduceRewriteLifecycle(artifact, {
    version: '1', type: 'human_finalization', parentArtifactFingerprint: artifact.artifactFingerprint,
    finalization: { version: '1', judgmentType: 'human_finalization', parentArtifactFingerprint: artifact.artifactFingerprint, binding: artifact.binding, evaluatorId: decision.evaluatorId, evidenceScope: { kind: 'candidate' }, decision: decision.decision, ...(capability ? { capability } : {}) },
  }, context);
}

export interface ApprovedLearningRequest {
  ready: RewriteLifecycleArtifactV1; approved: RewriteLifecycleArtifactV1;
  decision: { evaluatorId: string; decision: 'approve' }; capability: ApprovalCapabilityEnvelopeV1;
  source: string; candidate: string; profile: Profile; context: RewriteLifecycleContextV1;
  copySpec?: CopySpec; writingBrief?: WritingBrief;
}

export function recordApprovedLearning(request: ApprovedLearningRequest): LearningCaptureStatus {
  const { ready, approved, decision, capability, source, candidate, profile, context, copySpec, writingBrief } = request;
  if (Buffer.byteLength(source, 'utf8') > 1024 * 1024 || Buffer.byteLength(candidate, 'utf8') > 1024 * 1024) throw new Error('Approved learning text exceeds the byte limit.');
  inspectLifecycle(ready); inspectLifecycle(approved);
  const replay = finalizeLifecycle(ready, decision, context, capability);
  if (!replay.ok || canonicalJson(replay.artifact) !== canonicalJson(approved) || approved.status !== 'approved') throw new Error('Approved learning is not authorized.');
  const deterministic = verifyDeterministically(source, candidate, profile, copySpec, writingBrief);
  if (!deterministic.verification.passed || deterministic.artifact.artifactFingerprint !== approved.binding.deterministicArtifactFingerprint
    || deterministic.artifact.sourceHash !== approved.binding.sourceHash || deterministic.artifact.candidateHash !== approved.binding.candidateHash
    || deterministic.artifact.profileId !== approved.binding.profileId || deterministic.artifact.profileRevisionDigest !== approved.binding.profileRevisionDigest
    || deterministic.artifact.rulesetVersion !== approved.binding.rulesetVersion) throw new Error('Approved learning binding does not match deterministic verification.');
  return recordVerifiedCandidate(profile, deterministic.verification, candidate, { mutationId: `approved:${approved.artifactFingerprint}`, authority: 'team', provenance: `approved:${approved.capabilityFingerprint}`, compatibility: 'exact' });
}

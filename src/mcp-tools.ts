import { RULESET_VERSION, serializedRules } from './ai-editor.js';
import { parseCopySpec } from './copy-spec.js';
import { analyzeBatch, parseWritingBrief } from './editorial-packs.js';
import type { ApprovalCapabilityEnvelopeV1, ApprovalTrustStoreV1, DeterministicVerificationArtifactV1, PreEditReduction, ProfileV3, RecompositionPolicyV1, RewriteLifecycleArtifactV1, RewriteLifecycleBindingV1, RewriteLifecycleContextV1, RewriteReceipt, SemanticPolicy, SemanticReviewTaskV1, SemanticViolation } from './contracts.js';
import { clearLearning, composeLearning, inspectLearning, type LearningOptions, migrateLearningV2ToV3, ratifyLearningEvent, recordLearningInstruction, supersedeLearningEvent } from './learning.js';
import { analyze, rewritePrompt, verify, verifyWithCopySpec } from './pipeline.js';
import { parseProfile } from './profile.js';
import { evaluateRewriteResponse, parseRewriteTask, prepareRewriteTask } from './rewrite-task.js';
import { parseJudgmentEnvelope, preparePostCandidateJudgment, preparePreEditJudgment, reducePostCandidate, reducePreEdit } from './judgment-task.js';
import { evaluateRebuildResponse, parseRebuildTask, prepareRebuildTask, writerRequestForRebuild } from './rebuild-task.js';
import { inspectHiddenText, applyHiddenTextPolicy, parseHiddenTextPolicy } from './hidden-text.js';
import { buildProfile } from './voice-dna.js';
import { finalOutputCheck, inspectHygiene } from './hygiene.js';
import { finalizeLifecycle, inspectLifecycle, prepareLifecycle, recordApprovedLearning, submitSemanticVerdict, validateFinalApproval } from './lifecycle-adapter.js';

function profileFromJson(profileJson: string) {
  try {
    return parseProfile(JSON.parse(profileJson));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Profile is not valid JSON.');
  }
}

function profileV3FromJson(profileJson: string): ProfileV3 {
  const profile = profileFromJson(profileJson);
  if (profile.version !== '3') throw new Error('This learning operation requires a Profile v3.');
  return profile;
}

function copySpecFromJson(copySpecJson: string) {
  try {
    return parseCopySpec(JSON.parse(copySpecJson));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'CopySpec is not valid JSON.');
  }
}

function writingBriefFromJson(writingBriefJson: string | undefined) {
  if (!writingBriefJson) return undefined;
  try {
    return parseWritingBrief(JSON.parse(writingBriefJson));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'WritingBrief is not valid JSON.');
  }
}

export function buildProfileForMcp(samples: string[], avoid: string[] = []) {
  return buildProfile(samples, avoid);
}

export function analyzeForMcp(draft: string, profileJson: string, writingBriefJson?: string) {
  return analyze(draft, profileFromJson(profileJson), writingBriefFromJson(writingBriefJson));
}

export function inspectHygieneForMcp(draft: string) {
  return inspectHygiene(draft);
}

export function finalOutputCheckForMcp(text: string) {
  return finalOutputCheck(text);
}

export function rewritePromptForMcp(draft: string, profileJson: string, options: LearningOptions = {}, writingBriefJson?: string) {
  const profile = profileFromJson(profileJson);
  return { prompt: rewritePrompt(draft, profile, composeLearning(profile, options), writingBriefFromJson(writingBriefJson)) };
}

export function prepareRewriteForMcp(draft: string, profileJson: string, copySpecJson?: string, writingBriefJson?: string) {
  return prepareRewriteTask(draft, profileFromJson(profileJson), copySpecJson ? copySpecFromJson(copySpecJson) : undefined, writingBriefFromJson(writingBriefJson));
}

export function applyRewriteForMcp(taskJson: string, responseJson: string, profileJson: string) {
  return evaluateRewriteResponse(parseRewriteTask(JSON.parse(taskJson)), responseJson, profileFromJson(profileJson));
}

export function prepareJudgmentForMcp(stage: 'pre-edit' | 'post-candidate', kind: string, draft: string, profileJson: string, candidate?: string) {
  const profile = profileFromJson(profileJson);
  return stage === 'pre-edit'
    ? preparePreEditJudgment(draft, profile, kind as 'triage' | 'argument' | 'form')
    : preparePostCandidateJudgment(draft, candidate ?? '', profile, kind as 'argument' | 'polarity' | 'form' | 'flatness' | 'semantic');
}

export function reduceJudgmentForMcp(envelopesJson: string) {
  const envelopes = parsed<unknown[]>(envelopesJson, 'Judgment envelopes').map(parseJudgmentEnvelope);
  return envelopes[0]?.stage === 'pre-edit' ? reducePreEdit(envelopes) : reducePostCandidate(envelopes);
}

export function prepareRebuildForMcp(
  draft: string,
  profileJson: string,
  reductionJson: string,
  copySpecJson: string,
  capabilityJson: string,
  context: RewriteLifecycleContextV1,
  writingBriefJson?: string,
  recompositionPolicyJson?: string,
) {
  return prepareRebuildTask(
    draft,
    profileFromJson(profileJson),
    parsed<PreEditReduction>(reductionJson, 'Rebuild recommendation'),
    copySpecFromJson(copySpecJson),
    parsed<ApprovalCapabilityEnvelopeV1>(capabilityJson, 'Approval capability'),
    context.trustStore as ApprovalTrustStoreV1,
    context.now,
    writingBriefFromJson(writingBriefJson),
    recompositionPolicyJson ? parsed<RecompositionPolicyV1>(recompositionPolicyJson, 'Recomposition policy') : undefined,
  );
}

export function applyRebuildForMcp(taskJson: string, responseJson: string, profileJson: string, capabilityJson: string, context: RewriteLifecycleContextV1) {
  return evaluateRebuildResponse(
    parseRebuildTask(JSON.parse(taskJson)),
    responseJson,
    profileFromJson(profileJson),
    parsed<ApprovalCapabilityEnvelopeV1>(capabilityJson, 'Approval capability'),
    context.trustStore as ApprovalTrustStoreV1,
    context.now,
  );
}

export function inspectHiddenTextForMcp(text: string, policyJson?: string) {
  return inspectHiddenText(text, policyJson ? parseHiddenTextPolicy(parsed<unknown>(policyJson, 'Hidden-text policy')) : undefined);
}

export function applyHiddenTextPolicyForMcp(text: string, policyJson: string) {
  return applyHiddenTextPolicy(text, parseHiddenTextPolicy(parsed<unknown>(policyJson, 'Hidden-text policy')));
}

export function rebuildWriterRequestForMcp(taskJson: string) {
  return writerRequestForRebuild(parseRebuildTask(parsed<unknown>(taskJson, 'Rebuild task')));
}

export function verifyForMcp(original: string, candidate: string, profileJson: string, writingBriefJson?: string) {
  const profile = profileFromJson(profileJson);
  return verify(original, candidate, profile, writingBriefFromJson(writingBriefJson));
}

export function verifyCopySpecForMcp(original: string, candidate: string, profileJson: string, copySpecJson: string, writingBriefJson?: string) {
  const profile = profileFromJson(profileJson);
  return verifyWithCopySpec(original, candidate, profile, copySpecFromJson(copySpecJson), writingBriefFromJson(writingBriefJson));
}

function parsed<T>(json: string, label: string): T {
  if (Buffer.byteLength(json, 'utf8') > 1024 * 1024) throw new Error(`${label} exceeds the byte limit.`);
  try { return JSON.parse(json) as T; } catch { throw new Error(`${label} is not valid JSON.`); }
}

export function prepareLifecycleForMcp(deterministicJson: string, bindingJson: string, receiptJson: string, policy: SemanticPolicy, allowedViolations: SemanticViolation[]) {
  if (policy !== 'normal') throw new Error('High-assurance semantic review requires a trusted embedding.');
  return prepareLifecycle(parsed<DeterministicVerificationArtifactV1>(deterministicJson, 'Deterministic artifact'), parsed<RewriteLifecycleBindingV1>(bindingJson, 'Lifecycle binding'), parsed<RewriteReceipt>(receiptJson, 'Rewrite receipt'), policy, allowedViolations);
}

export function submitSemanticVerdictForMcp(artifactJson: string, taskJson: string, evaluatorId: string, verdictJson: string, context: RewriteLifecycleContextV1) {
  const task = parsed<SemanticReviewTaskV1>(taskJson, 'Semantic task');
  if (task.policy !== 'normal') throw new Error('High-assurance semantic review requires a trusted embedding.');
  return submitSemanticVerdict(parsed<RewriteLifecycleArtifactV1>(artifactJson, 'Lifecycle artifact'), task, evaluatorId, parsed<unknown>(verdictJson, 'Semantic verdict'), context);
}

export function inspectLifecycleForMcp(artifactJson: string) {
  return inspectLifecycle(parsed<RewriteLifecycleArtifactV1>(artifactJson, 'Lifecycle artifact'));
}

export function validateFinalApprovalForMcp(artifactJson: string, capabilityJson: string, context: RewriteLifecycleContextV1) {
  return validateFinalApproval(parsed<RewriteLifecycleArtifactV1>(artifactJson, 'Lifecycle artifact'), parsed<ApprovalCapabilityEnvelopeV1>(capabilityJson, 'Approval capability'), context);
}

export function finalizeLifecycleForMcp(artifactJson: string, decisionJson: string, context: RewriteLifecycleContextV1, capabilityJson?: string) {
  const decision = parsed<{ evaluatorId: string; decision: 'approve' | 'reject' }>(decisionJson, 'Finalization decision');
  if (decision.decision === 'approve' && !capabilityJson) throw new Error('Approval requires a capability.');
  if (decision.decision === 'reject' && capabilityJson) throw new Error('Rejection does not accept a capability.');
  return finalizeLifecycle(parsed<RewriteLifecycleArtifactV1>(artifactJson, 'Lifecycle artifact'), decision, context, capabilityJson ? parsed<ApprovalCapabilityEnvelopeV1>(capabilityJson, 'Approval capability') : undefined);
}

export function finalizeRejectionForMcp(artifactJson: string, decisionJson: string, context: RewriteLifecycleContextV1) {
  const decision = parsed<{ evaluatorId: string; decision: 'reject' }>(decisionJson, 'Finalization decision');
  if (decision.decision !== 'reject') throw new Error('Only rejection is available.');
  return finalizeLifecycle(parsed<RewriteLifecycleArtifactV1>(artifactJson, 'Lifecycle artifact'), decision, context);
}

export interface ApprovedLearningForMcpRequest {
  readyJson: string; approvedJson: string; source: string; candidate: string; profileJson: string;
  decisionJson: string; capabilityJson: string; context: RewriteLifecycleContextV1;
  copySpecJson?: string; writingBriefJson?: string;
}

export function recordApprovedLearningForMcp(request: ApprovedLearningForMcpRequest) {
  const { readyJson, approvedJson, source, candidate, profileJson, decisionJson, capabilityJson, context, copySpecJson, writingBriefJson } = request;
  return recordApprovedLearning({
    ready: parsed<RewriteLifecycleArtifactV1>(readyJson, 'Ready artifact'), approved: parsed<RewriteLifecycleArtifactV1>(approvedJson, 'Approved artifact'),
    decision: parsed<{ evaluatorId: string; decision: 'approve' }>(decisionJson, 'Finalization decision'), capability: parsed<ApprovalCapabilityEnvelopeV1>(capabilityJson, 'Approval capability'),
    source, candidate, profile: profileFromJson(profileJson), context,
    copySpec: copySpecJson ? copySpecFromJson(copySpecJson) : undefined, writingBrief: writingBriefFromJson(writingBriefJson),
  });
}

export function patternsForMcp() {
  return { version: RULESET_VERSION, rules: serializedRules() };
}

export function analyzeBatchForMcp(drafts: string[]) {
  return analyzeBatch(drafts);
}

export function inspectLearningForMcp(profileJson: string, options: LearningOptions = {}) {
  return inspectLearning(profileFromJson(profileJson), options);
}

export function recordLearningForMcp(profileJson: string, instruction: string, options: LearningOptions = {}) {
  return recordLearningInstruction(profileFromJson(profileJson), instruction, options);
}

export function ratifyLearningForMcp(profileJson: string, eventId: string, options: LearningOptions = {}) {
  return ratifyLearningEvent(profileV3FromJson(profileJson), eventId, options);
}

export function supersedeLearningForMcp(profileJson: string, eventId: string, options: LearningOptions = {}) {
  return supersedeLearningEvent(profileV3FromJson(profileJson), eventId, options);
}

export function migrateLearningForMcp(sourceProfileJson: string, targetProfileJson: string, options: LearningOptions = {}) {
  const source = profileFromJson(sourceProfileJson);
  if (source.version !== '2') throw new Error('Learning migration requires a Profile v2 source.');
  return migrateLearningV2ToV3(source, profileV3FromJson(targetProfileJson), options);
}

export function clearLearningForMcp(profileJson: string, options: LearningOptions = {}) {
  return { cleared: clearLearning(profileFromJson(profileJson), options) };
}

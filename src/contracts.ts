export type Severity = 'red' | 'yellow';
export type Engine = 'voice_dna' | 'ai_editor' | 'editorial';

export interface Sentence {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface Finding {
  engine: Engine;
  id: string;
  severity: Severity;
  sentence: number;
  excerpt: string;
  reason: string;
  suggestion: string;
  appliedPolicy?: RulePolicyState;
}

export interface EngineReport {
  engine: Engine;
  version: string;
  score: number;
  passed: boolean;
  findings: Finding[];
}

export interface VoiceDnaMetrics {
  sentenceLength: number;
  sentenceVariation: number;
  sentenceStructure: string[];
  rhythm: number;
  paragraphLength: number;
  openingMoves: string[];
  vocabulary: string[];
  lexicalDensity: number;
  pointOfView: 'first_person' | 'second_person' | 'third_person' | 'mixed';
  punctuation: Record<string, number>;
  caseStyle: 'lowercase' | 'standard' | 'mixed';
  questionRate: number;
  transitions: string[];
}

export interface ProfileV2 {
  version: '2';
  sampleCount: number;
  metrics: VoiceDnaMetrics;
  avoid: string[];
}

export type RulePolicyState = 'blocking' | 'advisory' | 'judgment-required' | 'disabled';
export type FingerprintMetric = 'contractionRate' | 'sentenceLengthDistribution' | 'bulletRate' | 'enDashRate';

export interface MetricTolerance {
  absolute: number;
  calibrated: boolean;
}

export interface ProfileProvenance {
  source: string;
  rights: string;
  createdAt: string;
}

export interface FounderFingerprint {
  contractionRate: number;
  sentenceLengthDistribution: { short: number; medium: number; long: number };
  bulletRate: number;
  enDashRate: number;
}

export interface ProfileV3 {
  version: '3';
  id: string;
  revision: number;
  revisionDigest: string;
  sampleCount: number;
  metrics: VoiceDnaMetrics;
  avoid: string[];
  provenance: ProfileProvenance;
  rulePolicy: Record<string, RulePolicyState>;
  fingerprint: FounderFingerprint;
  tolerances: Record<FingerprintMetric, MetricTolerance>;
  metricFixtures: Record<FingerprintMetric, string[]>;
}

export type Profile = ProfileV2 | ProfileV3;

export type WritingFormat = 'general' | 'social' | 'deck' | 'outreach' | 'blog' | 'audit' | 'website';
export type EvidenceStatus = 'primary' | 'attributed' | 'internal' | 'unverified';

export interface ArgumentMap {
  observation: string;
  mechanism: string;
  consequence: string;
  readerValue: string;
}

export interface WritingBrief {
  version: '1';
  audience: string;
  intent: string;
  format: WritingFormat;
  readerKnowsAuthor?: boolean;
  vocabulary?: string[];
  prohibitedTerms?: string[];
  title?: string;
  evidenceStatus?: EvidenceStatus;
  argumentMap?: ArgumentMap;
  factSources?: Array<{ id: string; text: string }>;
  factMetadata?: { allowedAssumptions?: string[]; approvedHypotheses?: string[] };
  requiredFacts?: Array<{ id: string; text: string; atoms?: string[] }>;
}

export interface BatchFinding {
  id: 'batch.repeated-opening' | 'batch.repeated-ending';
  severity: 'yellow';
  draftIndexes: number[];
  reason: string;
  suggestion: string;
}

export interface BatchReport {
  version: '1';
  findings: BatchFinding[];
  passed: true;
}

export type HygieneKind = 'ascii_control' | 'c1_control' | 'mid_document_bom' | 'zero_width' | 'bidi' | 'tag' | 'unusual_space';

interface HygieneHitBase {
  codepoint: string;
  label: string;
  kind: HygieneKind;
  count: number;
  offsets: number[];
}

export type HygieneHit = HygieneHitBase & { fix: 'remove' | 'none' };

export interface HygieneReport {
  version: '1';
  length: number;
  suspiciousCount: number;
  fixableCount: number;
  hits: HygieneHit[];
}

interface FinalOutputCheckBase {
  version: '1';
  changed: boolean;
  changes: HygieneChange[];
  input: HygieneReport;
  remaining: HygieneReport;
}

export type FinalOutputCheck = FinalOutputCheckBase & ({ accepted: true; output: string } | { accepted: false });

export interface HygieneChange {
  offset: number;
  codepoint: string;
  action: 'removed';
}

export type HiddenTextAction = 'remove' | 'preserve' | 'review' | 'reject';
export type HiddenTextKind = 'ascii_control' | 'c1_control' | 'mid_document_bom' | 'zero_width' | 'bidi' | 'tag' | 'unusual_space' | 'confusable';

export interface HiddenTextPolicyV1 {
  version: '1';
  name: 'minimal-text-control-cleanup';
  approvedRemovals: Array<'ascii_control' | 'mid_document_bom'>;
  acknowledgement: 'Removes only listed non-semantic controls; all other findings remain review-only.';
}

export interface HiddenTextFindingV1 {
  kind: HiddenTextKind;
  action: HiddenTextAction;
  codepoint: string;
  offset: number;
  reason: string;
}

export interface HiddenTextReportV1 {
  version: '1';
  inputHash: string;
  policyFingerprint: string;
  findings: HiddenTextFindingV1[];
  proposedChanges: HygieneChange[];
}

export interface HiddenTextApplyReceiptV1 extends HiddenTextReportV1 {
  outputHash: string;
  output: string;
  remaining: HiddenTextFindingV1[];
  idempotent: boolean;
}

export interface Analysis {
  version: string;
  voiceDna: EngineReport;
  aiEditor: EngineReport;
  editorial?: EngineReport;
  hygiene: HygieneReport;
  passed: boolean;
}

export interface Verification {
  version: string;
  original: Analysis;
  candidate: Analysis;
  preservationScore: number;
  regressions: Finding[];
  finalOutput: FinalOutputCheck;
  logicLint: import('./logic-linter.js').LogicLintReport;
  factLint?: import('./fact-linter.js').FactLintReport;
  requiredFacts?: ClaimVerification;
  passed: boolean;
}

export interface CopyClaim {
  id: string;
  text: string;
  evidence: string;
  mutable?: boolean;
  atoms?: string[];
}

export interface CopySpec {
  version: '1';
  audience: string;
  intent: string;
  channel: string;
  claims: CopyClaim[];
  prohibitedClaims?: string[];
}

export interface ClaimFailure {
  id: string;
  code: 'missing_immutable_claim' | 'missing_immutable_atom' | 'prohibited_claim';
  message: string;
  evidence?: string;
}

export interface ClaimVerification {
  passed: boolean;
  failures: ClaimFailure[];
  sentenceClaims: Record<number, string[]>;
}

export interface CopySpecVerification extends Verification {
  claims: ClaimVerification;
}

export interface RewriteTaskSentence {
  id: number;
  text: string;
  eligible: boolean;
}

export interface RewriteTask {
  version: '1';
  fingerprint: string;
  draft: string;
  sentences: RewriteTaskSentence[];
  eligibleSentenceIds: number[];
  prompt: string;
  copySpec?: CopySpec;
  writingBrief?: WritingBrief;
}

export interface RewriteReplacement {
  sentenceId: number;
  text: string;
}

export interface RewriteResponse {
  version: '1';
  taskFingerprint: string;
  replacements: RewriteReplacement[];
}

export interface SentenceRange {
  startSentenceId: number;
  endSentenceId: number;
}

export interface RewriteRangeOperation {
  startSentenceId: number;
  endSentenceId: number;
  text: string;
}

export interface HygieneSourceFinding {
  kind: 'hygiene';
  start: number;
  end: number;
  codepoint: string;
  eligible: boolean;
}

export interface HygieneRangeOperation {
  start: number;
  end: number;
  text: string;
}

export interface RewriteResponseV2 {
  version: '2';
  taskFingerprint: string;
  operations: RewriteRangeOperation[];
  hygieneOperations?: HygieneRangeOperation[];
}

export type RewriteFailureCode = 'invalid_json' | 'invalid_response_shape' | 'invalid_response_version' | 'task_fingerprint_mismatch' | 'duplicate_sentence_id' | 'unknown_sentence_id' | 'ineligible_sentence_id' | 'invalid_replacement_text' | 'response_too_large' | 'overlapping_range' | 'noncontiguous_range' | 'out_of_order_range' | 'partly_locked_range' | 'ineligible_hygiene_offset' | 'rebuild_response_on_edit_task' | 'edit_response_on_rebuild_task' | 'invalid_candidate_text' | 'lexical_residual_exceeds_policy';

export type JudgmentStage = 'pre-edit' | 'post-candidate';
export type JudgmentKind = 'triage' | 'argument' | 'form' | 'polarity' | 'flatness' | 'semantic';
export type PreEditDecision = 'SHIP' | 'EDIT' | 'REBUILD';
export type PostCandidateDecision = 'CLEAR' | 'ESCALATE' | 'REBUILD';

export interface JudgmentFindingV1 {
  kind: JudgmentKind;
  unbounded?: boolean;
  ranges?: SentenceRange[];
}

export interface JudgmentBindingsV1 {
  sourceHash: string;
  candidateHash?: string;
  profileId: string;
  profileRevisionDigest: string;
  rulesetVersion: string;
  evaluatorId: string;
  evidenceScope: { sentenceIds: number[] };
}

export interface JudgmentTaskV1 {
  version: '1';
  stage: JudgmentStage;
  judgmentType: JudgmentKind;
  taskFingerprint: string;
  draft?: string;
  candidate?: string;
  bindings: Omit<JudgmentBindingsV1, 'evaluatorId'>;
  allowedDecisions: Array<PreEditDecision | PostCandidateDecision>;
}

export interface JudgmentEnvelopeV1 {
  version: '1';
  stage: JudgmentStage;
  judgmentType: JudgmentKind;
  taskFingerprint: string;
  bindings: JudgmentBindingsV1;
  findings: JudgmentFindingV1[];
  decision: PreEditDecision | PostCandidateDecision;
  editScope?: { ranges: SentenceRange[] };
}

export interface PreEditReduction {
  decision: PreEditDecision;
  editScope: { ranges: SentenceRange[] };
  reason?: 'unbounded_argument_failure';
  recommendationFingerprint: string;
}

export interface RewriteFailure {
  code: RewriteFailureCode;
  message: string;
  path?: string;
}

export interface RewriteReceipt {
  version: '1';
  taskFingerprint: string;
  responseFingerprint: string;
  adapterIds: string[];
  replacementSentenceIds?: number[];
  operationRanges?: SentenceRange[];
  mode?: 'SHIP' | 'EDIT' | 'REBUILD';
  preservationBypass?: boolean;
  preservationScore?: number;
  authorizationFingerprint?: string;
  recommendationFingerprint?: string;
  lexicalResidual?: LexicalResidualReportV1;
  provenanceStatus?: ProvenanceStatusV1;
}

export interface RewriteApplyResult {
  status: 'accepted' | 'repairable';
  candidate?: string;
  failures: RewriteFailure[];
  receipt: RewriteReceipt;
}

export interface RewriteEvaluation extends Omit<RewriteApplyResult, 'status'> {
  status: 'accepted' | 'repairable' | 'needs_escalation' | 'needs_semantic_review';
  verification?: Verification | CopySpecVerification;
  deterministicArtifact?: DeterministicVerificationArtifactV1;
  lifecycleBinding?: RewriteLifecycleBindingV1;
}

export interface RebuildTask {
  version: '1';
  fingerprint: string;
  draft: string;
  prompt: string;
  copySpec: CopySpec;
  writingBrief?: WritingBrief;
  recommendationFingerprint: string;
  authorizationFingerprint: string;
  profileId: string;
  profileRevisionDigest: string;
  recompositionPolicy?: RecompositionPolicyV1;
}

export interface RebuildWriterRequestV1 {
  version: '1';
  taskFingerprint: string;
  prompt: string;
  copySpecFingerprint: string;
  recompositionPolicyFingerprint?: string;
}

export type ProvenanceStatusV1 =
  | { version: '1'; state: 'not_configured' }
  | { version: '1'; state: 'unknown'; reason: 'private_or_unavailable_verifier' }
  | { version: '1'; state: 'verified_present'; verifier: { id: string; version: string }; evidenceFingerprint: string }
  | { version: '1'; state: 'verified_clear'; verifier: { id: string; version: string }; evidenceFingerprint: string }
  | { version: '1'; state: 'inconclusive'; verifier: { id: string; version: string }; reason: string };

export interface RecompositionPolicyV1 {
  version: '1';
  mode: 'meaning-first';
  lexicalResidual: {
    ngramSize: 5;
    maxSharedNgramFraction: number;
    maxLongestSharedRunTokens: number;
  };
  acknowledgement: 'Measures shared wording only; does not detect or prove removal of a watermark.';
}

export interface LexicalResidualReportV1 {
  version: '1';
  sourceTokenCount: number;
  candidateTokenCount: number;
  ngramSize: 5;
  sharedNgramFraction: number;
  longestSharedRunTokens: number;
  allowedResiduals: Array<{ reason: 'copy-spec-claim' | 'copy-spec-atom'; count: number }>;
  passed: boolean;
  statement: 'Lexical overlap is not a watermark detector.';
}

export interface RebuildResponse {
  version: '1';
  mode: 'REBUILD';
  taskFingerprint: string;
  candidate: string;
}

export type RebuildFailureCode = 'invalid_json' | 'invalid_response_shape' | 'invalid_response_version' | 'task_fingerprint_mismatch' | 'invalid_candidate_text' | 'response_too_large' | 'edit_response_on_rebuild_task';

export interface RebuildFailure {
  code: RebuildFailureCode;
  message: string;
  path?: string;
}

export type SemanticViolation = 'action_change' | 'dropped_object' | 'unsupported_claim' | 'constraint_weakened' | 'clarity_regression';

export interface SemanticVerdict {
  evaluatorId: string;
  approved: boolean;
  violations: SemanticViolation[];
}

export interface SemanticReview {
  status: 'accepted' | 'needs_escalation';
  verdicts: SemanticVerdict[];
  reason?: 'insufficient_evaluators' | 'evaluator_disagreement' | 'semantic_violation';
}

export type SemanticPolicy = 'normal' | 'high_assurance';
export type RewriteLifecycleStatus = 'needs_semantic_review' | 'ready_for_human_review' | 'approved' | 'needs_escalation';
export type LifecycleEscalationReason = 'semantic_rejection' | 'semantic_disagreement' | 'human_rejection';

export interface RewriteLifecycleBindingV1 {
  rewriteTaskFingerprint: string;
  rewriteResponseFingerprint: string;
  deterministicArtifactFingerprint: string;
  sourceHash: string;
  candidateHash: string;
  profileId: string;
  profileRevisionDigest: string;
  rulesetVersion: string;
  schemaVersion: '1';
}

export interface DeterministicVerificationArtifactV1 {
  version: '1';
  verificationKind: 'standard' | 'copy_spec' | 'rebuild';
  passed: boolean;
  artifactFingerprint: string;
  analysisVersion: string;
  rulesetVersion: string;
  preservationMetricVersion: 'legacy-set-v1';
  preservationScore: number;
  sourceHash: string;
  candidateHash: string;
  profileId: string;
  profileRevisionDigest: string;
  copySpecHash?: string;
  writingBriefHash?: string;
  regressionKeys: string[];
  claimFailureKeys?: string[];
}

export interface SemanticEvidenceScopeV1 { sentenceIds: number[] }

export interface SemanticReviewTaskV1 {
  version: '1';
  judgmentType: 'semantic';
  taskFingerprint: string;
  binding: RewriteLifecycleBindingV1;
  policy: SemanticPolicy;
  evidenceScope: SemanticEvidenceScopeV1;
  allowedViolations: SemanticViolation[];
}

export interface SemanticVerdictV1 {
  version: '1';
  judgmentType: 'semantic';
  taskFingerprint: string;
  binding: RewriteLifecycleBindingV1;
  evidenceScope: SemanticEvidenceScopeV1;
  evaluatorId: string;
  approved: boolean;
  violations: SemanticViolation[];
}

export interface ApprovalCapabilityEnvelopeV1 { payload: string; signature: string }
export type ApprovalCapabilityPurpose = 'hyv.final-approval' | 'hyv.rebuild-authorization';
export interface ApprovalCapabilityClaimsV1 {
  version: '1';
  purpose: ApprovalCapabilityPurpose;
  issuer: string;
  audience: '@holdyourvoice/hyv';
  subjectArtifactFingerprint: string;
  sourceHash: string;
  candidateHash: string;
  profileId: string;
  profileRevisionDigest: string;
  keyId: string;
  issuedAt: number;
  notBefore: number;
  expiresAt: number;
  nonce: string;
}

export interface ApprovalTrustKeyV1 {
  issuer: string;
  keyId: string;
  publicKeySpki: string;
  status: 'active' | 'revoked';
  activeFrom?: number;
  activeUntil?: number;
}
export interface ApprovalTrustStoreV1 {
  version: '1';
  audience: '@holdyourvoice/hyv';
  maxCapabilityLifetimeSeconds: number;
  keys: ApprovalTrustKeyV1[];
}

export interface HumanFinalizationV1 {
  version: '1';
  judgmentType: 'human_finalization';
  parentArtifactFingerprint: string;
  binding: RewriteLifecycleBindingV1;
  evaluatorId: string;
  evidenceScope: { kind: 'candidate' };
  decision: 'approve' | 'reject';
  capability?: ApprovalCapabilityEnvelopeV1;
}

export interface SemanticSubmissionActionV1 {
  version: '1';
  type: 'semantic_submission';
  parentArtifactFingerprint: string;
  taskFingerprint: string;
  verdicts: SemanticVerdictV1[];
}
export interface HumanFinalizationActionV1 {
  version: '1';
  type: 'human_finalization';
  parentArtifactFingerprint: string;
  finalization: HumanFinalizationV1;
}
export type RewriteLifecycleActionV1 = SemanticSubmissionActionV1 | HumanFinalizationActionV1;

export interface RewriteLifecycleArtifactV1 {
  version: '1';
  status: RewriteLifecycleStatus;
  artifactFingerprint: string;
  parentArtifactFingerprint?: string;
  transitionFingerprint: string;
  binding: RewriteLifecycleBindingV1;
  semanticPolicy: SemanticPolicy;
  semanticTaskFingerprint: string;
  semanticEvidenceScopeFingerprint: string;
  verdictFingerprints: string[];
  capabilityFingerprint?: string;
  reason?: LifecycleEscalationReason;
}

export interface RewriteLifecycleContextV1 {
  now: number;
  trustStore: ApprovalTrustStoreV1;
  authorizedSemanticEvaluatorIds: { normal: string[]; highAssurance: string[] };
  authorizedHumanFinalizerIds: string[];
}

export type LifecycleError = 'invalid_action' | 'invalid_binding' | 'task_fingerprint_mismatch' | 'evidence_scope_mismatch' | 'evaluator_not_authorized' | 'human_finalizer_not_authorized' | 'duplicate_evaluator' | 'invalid_verdict_count' | 'contradictory_verdict' | 'stale_parent' | 'conflicting_replay' | 'out_of_order_transition' | 'terminal_state' | 'capability_required' | 'capability_invalid';

export type CapabilityError = 'invalid_encoding' | 'size_exceeded' | 'invalid_schema' | 'non_canonical' | 'wrong_version' | 'wrong_purpose' | 'wrong_audience' | 'binding_mismatch' | 'unknown_key' | 'revoked_key' | 'inactive_key' | 'premature' | 'expired' | 'lifetime_exceeded' | 'invalid_signature';

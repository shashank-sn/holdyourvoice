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

export interface Profile {
  version: string;
  sampleCount: number;
  metrics: VoiceDnaMetrics;
  avoid: string[];
}

export type WritingFormat = 'general' | 'social' | 'deck' | 'outreach' | 'blog' | 'audit' | 'website';

export interface WritingBrief {
  version: '1';
  audience: string;
  intent: string;
  format: WritingFormat;
  readerKnowsAuthor?: boolean;
  vocabulary?: string[];
  prohibitedTerms?: string[];
  title?: string;
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

export interface Analysis {
  version: string;
  voiceDna: EngineReport;
  aiEditor: EngineReport;
  editorial?: EngineReport;
  passed: boolean;
}

export interface Verification {
  version: string;
  original: Analysis;
  candidate: Analysis;
  preservationScore: number;
  regressions: Finding[];
  passed: boolean;
}

export interface CopyClaim {
  id: string;
  text: string;
  evidence: string;
  mutable?: boolean;
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
  code: 'missing_immutable_claim' | 'prohibited_claim';
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

export type RewriteFailureCode = 'invalid_json' | 'invalid_response_shape' | 'invalid_response_version' | 'task_fingerprint_mismatch' | 'duplicate_sentence_id' | 'unknown_sentence_id' | 'ineligible_sentence_id' | 'invalid_replacement_text' | 'response_too_large';

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

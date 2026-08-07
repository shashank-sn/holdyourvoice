import type { SemanticReview, SemanticVerdict, SemanticViolation } from './contracts.js';

const violations = new Set<SemanticViolation>(['action_change', 'dropped_object', 'unsupported_claim', 'constraint_weakened', 'clarity_regression']);

export function parseSemanticVerdict(evaluatorId: string, value: unknown): SemanticVerdict {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Semantic evaluator response must be an object.');
  const verdict = value as Partial<SemanticVerdict>;
  if (typeof verdict.approved !== 'boolean' || !Array.isArray(verdict.violations) || !verdict.violations.every((item) => typeof item === 'string' && violations.has(item as SemanticViolation))) {
    throw new Error('Semantic evaluator response must include approved and known violations.');
  }
  return { evaluatorId, approved: verdict.approved, violations: verdict.violations as SemanticViolation[] };
}

export function reviewSemanticVerdicts(verdicts: SemanticVerdict[]): SemanticReview {
  const ids = new Set(verdicts.map((verdict) => verdict.evaluatorId));
  if (verdicts.length !== 3 || ids.size !== 3) return { status: 'needs_escalation', verdicts, reason: 'insufficient_evaluators' };
  if (verdicts.every((verdict) => verdict.approved && verdict.violations.length === 0)) return { status: 'accepted', verdicts };
  if (verdicts.some((verdict) => verdict.approved)) return { status: 'needs_escalation', verdicts, reason: 'evaluator_disagreement' };
  return { status: 'needs_escalation', verdicts, reason: 'semantic_violation' };
}

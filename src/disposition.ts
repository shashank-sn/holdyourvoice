import type { Finding } from './contracts.js';
export type FindingDisposition = 'block' | 'review' | 'signal';
export interface NormalizedFindingV1 { version: '1'; id: string; disposition: FindingDisposition; evidence: { engine: Finding['engine']; sentence: number; excerpt: string }; reason: string; suggestion: string; confidence: 'deterministic'; }
export interface SurfacePolicyV1 { version: '1'; overrides: Record<string, FindingDisposition>; }
export function parseSurfacePolicy(value: unknown): SurfacePolicyV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Surface policy is invalid.');
  const policy = value as Record<string, unknown>;
  if (policy.version !== '1' || !policy.overrides || typeof policy.overrides !== 'object' || Array.isArray(policy.overrides) || Object.keys(policy).some((key) => !['version', 'overrides'].includes(key)) || !Object.entries(policy.overrides as Record<string, unknown>).every(([id, disposition]) => /^[a-z][a-z0-9.-]+$/.test(id) && ['block', 'review', 'signal'].includes(disposition as string))) throw new Error('Surface policy is invalid.');
  return policy as unknown as SurfacePolicyV1;
}
export function normalizeFinding(finding: Finding, policy?: SurfacePolicyV1): NormalizedFindingV1 {
  const base: FindingDisposition = finding.appliedPolicy === 'blocking' || (finding.engine === 'voice_dna' && finding.severity === 'red') ? 'block'
    : finding.appliedPolicy === 'judgment-required' ? 'review' : 'signal';
  const disposition = policy?.overrides[finding.id] ?? base;
  return { version: '1', id: finding.id, disposition, evidence: { engine: finding.engine, sentence: finding.sentence, excerpt: finding.excerpt }, reason: finding.reason, suggestion: finding.suggestion, confidence: 'deterministic' };
}

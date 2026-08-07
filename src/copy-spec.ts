import type { ClaimFailure, ClaimVerification, CopyClaim, CopySpec } from './contracts.js';
import { sentences } from './text.js';

function normalized(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}

function isClaim(value: unknown): value is CopyClaim {
  if (!value || typeof value !== 'object') return false;
  const claim = value as Partial<CopyClaim>;
  return isText(claim.id, 100) && /^[A-Za-z0-9._-]+$/.test(claim.id)
    && isText(claim.text, 2_000) && isText(claim.evidence, 4_000)
    && (claim.mutable === undefined || typeof claim.mutable === 'boolean');
}

export function parseCopySpec(value: unknown): CopySpec {
  if (!value || typeof value !== 'object') throw new Error('CopySpec must be a JSON object.');
  const spec = value as Partial<CopySpec>;
  if (spec.version !== '1' || !isText(spec.audience, 500) || !isText(spec.intent, 500) || !isText(spec.channel, 100)
    || !Array.isArray(spec.claims) || spec.claims.length === 0 || spec.claims.length > 100 || !spec.claims.every(isClaim)
    || new Set(spec.claims.map((claim) => claim.id)).size !== spec.claims.length
    || (spec.prohibitedClaims !== undefined && (!Array.isArray(spec.prohibitedClaims) || spec.prohibitedClaims.length > 100 || !spec.prohibitedClaims.every((claim) => isText(claim, 2_000))))) {
    throw new Error('CopySpec is not valid. It needs version "1", audience, intent, channel, unique claims with text and evidence, and optional prohibitedClaims.');
  }
  return spec as CopySpec;
}

export function verifyClaims(candidate: string, spec: CopySpec): ClaimVerification {
  const draftSentences = sentences(candidate);
  const normalizedCandidate = normalized(candidate);
  const sentenceClaims: Record<number, string[]> = {};
  const failures: ClaimFailure[] = [];

  for (const claim of spec.claims) {
    const claimText = normalized(claim.text);
    const matching = draftSentences.filter((sentence) => normalized(sentence.text).includes(claimText));
    for (const sentence of matching) (sentenceClaims[sentence.index] ??= []).push(claim.id);
    if (!claim.mutable && matching.length === 0) {
      failures.push({ id: claim.id, code: 'missing_immutable_claim', message: `Immutable claim ${claim.id} is absent or changed.`, evidence: claim.evidence });
    }
  }

  for (const claim of spec.prohibitedClaims ?? []) {
    if (normalizedCandidate.includes(normalized(claim))) {
      failures.push({ id: claim, code: 'prohibited_claim', message: `Prohibited claim appears in the candidate: ${claim}` });
    }
  }

  return { passed: failures.length === 0, failures, sentenceClaims };
}

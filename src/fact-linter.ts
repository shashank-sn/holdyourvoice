import { sentences } from './text.js';

export type FactClaimKind = 'fact' | 'number' | 'entity' | 'date_time' | 'causal' | 'comparative' | 'attribution_quote' | 'opinion' | 'hypothesis';
export type FactFindingKind = 'unsupported_claim' | 'missing_evidence' | 'number_drift' | 'date_drift' | 'entity_drift' | 'quote_drift' | 'capability_drift' | 'causal_overreach' | 'comparative_overreach' | 'draft_contradiction' | 'semantic_contradiction';
export type FactSeverity = 'error' | 'warning' | 'needs_human_review';

export interface FactSource { id: string; text: string; }
export interface FactMetadata { audience?: string; contentType?: string; allowedAssumptions?: string[]; approvedHypotheses?: string[]; }
export interface SemanticAdapter {
  readonly id: string;
  readonly external?: boolean;
  compare(input: { claim: string; sources: FactSource[] }): 'supported' | 'contradicted' | 'unknown';
}
export interface FactLintInput { sources: FactSource[]; draft: string; metadata?: FactMetadata; semanticAdapter?: SemanticAdapter; allowExternalSemantic?: boolean; }
export interface FactClaim { text: string; sentence: number; start: number; end: number; kinds: FactClaimKind[]; }
export interface FactEvidence { sourceId: string; excerpt: string; start: number; end: number; }
export interface FactFinding { severity: FactSeverity; kind: FactFindingKind; claim: string; draftLocation: { sentence: number; start: number; end: number }; reason: string; evidence: FactEvidence[]; confidence: 'high' | 'medium' | 'low'; suggestedAction: string; }
export interface FactLintReport { version: '1'; summary: { checked: number; supported: number; unsupported: number; contradicted: number; humanReview: number }; claims: FactClaim[]; findings: FactFinding[]; skippedChecks: string[]; }

const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'will', 'with']);
const DATE = /\b(?:\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi;
const QUOTE = /["“]([^"”]+)["”]/;

function normal(value: string): string { return value.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, ' ').trim(); }
function tokens(value: string): string[] { return normal(value).split(' ').filter((word) => word.length > 1 && !STOP_WORDS.has(word)); }
function evidence(source: FactSource, text: string): FactEvidence { const start = source.text.indexOf(text); return { sourceId: source.id, excerpt: text, start: Math.max(0, start), end: Math.max(0, start) + text.length }; }
function sourceSentences(sources: FactSource[]): { source: FactSource; text: string }[] { return sources.flatMap((source) => sentences(source.text).map((sentence) => ({ source, text: sentence.text }))); }
function hasOverlap(claim: string, source: string): boolean {
  const claimTokens = tokens(claim); const sourceTokens = new Set(tokens(source));
  return claimTokens.length > 0 && claimTokens.filter((token) => sourceTokens.has(token)).length / claimTokens.length >= 0.65;
}
function dates(value: string): string[] { return [...value.matchAll(DATE)].map((match) => new Date(match[0]).toISOString().slice(0, 10)).filter((value) => value !== ''); }
function numbers(value: string): string[] { return value.match(/\b\d+(?:\.\d+)?\s*(?:%|days?|hours?|weeks?|months?|years?)?\b/gi) ?? []; }
function negated(value: string): boolean { return /\b(?:does not|do not|did not|is not|are not|cannot|can't|won't|not)\b/i.test(value); }
const NON_ENTITIES = new Set(['A', 'An', 'And', 'After', 'As', 'At', 'But', 'For', 'From', 'He', 'I', 'In', 'It', 'Its', 'On', 'Or', 'She', 'The', 'This', 'That', 'They', 'We', 'With', 'You']);
function entities(value: string): string[] {
  return (value.match(/\b[A-Z][\p{L}\p{M}'-]*(?:\s+[A-Z][\p{L}\p{M}'-]+)?\b/gu) ?? []).filter((entity) => !NON_ENTITIES.has(entity) && entity !== entity.toUpperCase());
}
function kindFor(text: string): FactClaimKind[] {
  const kinds: FactClaimKind[] = [];
  if (/\b(i think|i feel|in my view|we believe)\b/i.test(text)) kinds.push('opinion');
  if (/\b(may|might|could|likely|hypothesis)\b/i.test(text)) kinds.push('hypothesis');
  if (/\b(caused?|because|led to|resulted in)\b/i.test(text)) kinds.push('causal');
  if (/\b(best|better|more|less|fastest|largest|every alternative|than)\b/i.test(text)) kinds.push('comparative');
  if (QUOTE.test(text) || /\b(said|according to|reported)\b/i.test(text)) kinds.push('attribution_quote');
  if (dates(text).length) kinds.push('date_time');
  if (/\b\d+(?:\.\d+)?%?\b/.test(text)) kinds.push('number');
  if (entities(text).length) kinds.push('entity');
  if (!kinds.length) kinds.push('fact');
  return kinds;
}
function findRelevant(claim: string, sources: { source: FactSource; text: string }[]): { source: FactSource; text: string }[] {
  const terms = tokens(claim); return sources.filter(({ text }) => terms.some((term) => tokens(text).includes(term)));
}
function fallbackEvidence(sources: { source: FactSource; text: string }[]): FactEvidence[] {
  const line = sources[0]; return line ? [evidence(line.source, line.text)] : [];
}
function finding(claim: FactClaim, kind: FactFindingKind, severity: FactSeverity, reason: string, evidenceItems: FactEvidence[], confidence: FactFinding['confidence'], suggestedAction: string): FactFinding {
  return { severity, kind, claim: claim.text, draftLocation: { sentence: claim.sentence, start: claim.start, end: claim.end }, reason, evidence: evidenceItems, confidence, suggestedAction };
}

export function extractFactClaims(draft: string): FactClaim[] {
  const output = sentences(draft).map((sentence) => ({ text: sentence.text, sentence: sentence.index, start: sentence.start, end: sentence.end, kinds: kindFor(sentence.text) }));
  for (const match of draft.matchAll(/["“]([^"”]+)["”]/g)) {
    const start = match.index ?? 0; const containing = output.find((claim) => claim.start <= start && claim.end >= start) ?? output.find((claim) => claim.start <= start) ?? output[0];
    if (containing) output.push({ text: match[0], sentence: containing.sentence, start, end: start + match[0].length, kinds: ['attribution_quote'] });
  }
  return output;
}

export function lintFacts(input: FactLintInput): FactLintReport {
  if (!input.sources.length) throw new Error('Fact lint requires at least one source document.');
  if (!input.sources.every((source) => source.id.trim() && source.text.trim())) throw new Error('Every fact-lint source needs a non-empty id and text.');
  const claims = extractFactClaims(input.draft); const sourceLines = sourceSentences(input.sources); const findings: FactFinding[] = [];
  const semanticAdapter = input.semanticAdapter && (!input.semanticAdapter.external || input.allowExternalSemantic) ? input.semanticAdapter : undefined;
  const approved = new Set(input.metadata?.approvedHypotheses?.map(normal) ?? []);
  const allowed = new Set(input.metadata?.allowedAssumptions?.map(normal) ?? []);
  for (const claim of claims) {
    if (claim.kinds.includes('opinion') || allowed.has(normal(claim.text)) || (claim.kinds.includes('hypothesis') && approved.has(normal(claim.text)))) continue;
    const relevant = findRelevant(claim.text, sourceLines);
    const same = sourceLines.find(({ text }) => hasOverlap(claim.text, text));
    const evidenceItems = relevant.length ? relevant.slice(0, 2).map(({ source, text }) => evidence(source, text)) : fallbackEvidence(sourceLines);
    const quote = claim.text.match(QUOTE)?.[1];
    const quoteRelevant = sourceLines.filter(({ text }) => /\b(said|according to|reported)\b/i.test(text));
    if (quote && input.sources.some((source) => /\b(said|according to|reported)\b/i.test(source.text)) && !input.sources.some((source) => source.text.includes(quote))) {
      const quoteEvidence = quoteRelevant.length ? quoteRelevant.slice(0, 2).map(({ source, text }) => evidence(source, text)) : input.sources.slice(0, 1).map((source) => evidence(source, source.text));
      findings.push(finding(claim, 'quote_drift', 'error', 'The quoted wording differs from the supplied source.', quoteEvidence, 'high', 'Use the source wording or label the text as a paraphrase.')); continue;
    }
    const claimDates = dates(claim.text); const sourceDates = relevant.flatMap(({ text }) => dates(text));
    const claimNumbers = numbers(claim.text); const sourceNumbers = relevant.flatMap(({ text }) => numbers(text));
    if (!claimDates.length && !claim.kinds.includes('attribution_quote') && claimNumbers.length && sourceNumbers.length && claimNumbers.some((number) => !sourceNumbers.some((sourceNumber) => normal(sourceNumber) === normal(number)))) {
      findings.push(finding(claim, 'number_drift', 'error', 'A number or unit differs from relevant source evidence.', evidenceItems, 'high', 'Correct the number or unit, or cite a newer source.')); continue;
    }
    if (claimDates.length && sourceDates.length && claimDates.some((date) => !sourceDates.includes(date))) {
      findings.push(finding(claim, 'date_drift', 'error', 'The draft date differs from relevant source evidence.', evidenceItems, 'high', 'Correct the date or cite a newer source.')); continue;
    }
    const claimEntities = entities(claim.text); const sourceEntities = relevant.flatMap(({ text }) => entities(text));
    if (claimEntities.length && sourceEntities.length && claimEntities.some((entity) => !sourceEntities.some((sourceEntity) => normal(sourceEntity) === normal(entity)))) {
      findings.push(finding(claim, 'entity_drift', 'error', 'A named entity differs from relevant source evidence.', evidenceItems, 'high', 'Correct the name or cite the source that supports it.')); continue;
    }
    const capabilityTerms = (text: string) => tokens(text).filter((token) => /^(export|exports|supports|include|includes|works|csv|pdf)$/i.test(token));
    const claimCapabilities = capabilityTerms(claim.text).map((token) => token.replace(/s$/, ''));
    if (claimCapabilities.length && relevant.some(({ text }) => claimCapabilities.every((token) => capabilityTerms(text).map((value) => value.replace(/s$/, '')).includes(token)))) {
      if (relevant.some(({ text }) => negated(text) !== negated(claim.text))) {
        findings.push(finding(claim, 'capability_drift', 'error', 'The draft reverses the source capability.', evidenceItems, 'high', 'Match the source capability polarity or cite contrary evidence.')); continue;
      }
      continue;
    }
    if (/\b(exports?|supports|includes?|works? with|can\s+(?:export|support|include))\b/i.test(claim.text) && relevant.length) {
      findings.push(finding(claim, 'capability_drift', 'error', 'The product capability is not established by the relevant source wording.', evidenceItems, 'high', 'Align the capability with the source or add evidence.')); continue;
    }
    const causalOverreach = claim.kinds.includes('causal') && relevant.length && !relevant.some(({ text }) => /\b(caused?|because|led to|resulted in)\b/i.test(text));
    const comparativeOverreach = claim.kinds.includes('comparative') && relevant.length && !relevant.some(({ text }) => /\b(better|more|less|than|best|largest|fastest)\b/i.test(text));
    if (causalOverreach) findings.push(finding(claim, 'causal_overreach', 'warning', 'The sources describe an outcome but do not establish causation.', evidenceItems, 'medium', 'Use an association claim or add causal evidence.'));
    if (comparativeOverreach) findings.push(finding(claim, 'comparative_overreach', 'warning', 'The sources do not establish the comparison.', evidenceItems, 'medium', 'Narrow the comparison or add comparative evidence.'));
    if (causalOverreach || comparativeOverreach) continue;
    if (claimDates.length && claimDates.some((date) => sourceDates.includes(date))) continue;
    if (same) continue;
    if (!relevant.length && claim.kinds.includes('fact') && tokens(claim.text).length <= 4) {
      findings.push(finding(claim, 'missing_evidence', 'needs_human_review', 'No close source evidence was found; the wording is too sparse for a reliable deterministic verdict.', evidenceItems, 'low', 'Confirm with a reviewer or provide a source.')); continue;
    }
    if ((!relevant.length || (claim.kinds.includes('number') && !relevant.some(({ text }) => /\b\d+(?:\.\d+)?%?\b/.test(text))))) {
      findings.push(finding(claim, 'unsupported_claim', 'error', 'No supplied source supports this checkable claim.', evidenceItems, 'medium', 'Add a source, remove the claim, or mark it as an approved hypothesis.')); continue;
    }
    const semantic = semanticAdapter?.compare({ claim: claim.text, sources: input.sources });
    if (semantic === 'supported') continue;
    if (semantic === 'contradicted') {
      findings.push(finding(claim, 'semantic_contradiction', 'error', 'The configured semantic adapter found contradictory source evidence.', evidenceItems, 'medium', 'Review the cited sources and correct or qualify the claim.')); continue;
    }
    findings.push(finding(claim, 'missing_evidence', 'needs_human_review', 'Relevant source material exists, but deterministic matching could not establish support.', evidenceItems, 'low', 'Review the source context or enable an approved semantic adapter.'));
  }
  const normalizedClaims = claims.map((claim) => ({ claim, text: normal(claim.text) }));
  for (let index = 0; index < normalizedClaims.length; index += 1) for (let other = index + 1; other < normalizedClaims.length; other += 1) {
    const left = normalizedClaims[index]; const right = normalizedClaims[other];
    const leftCore = normal(left.text.replace(/\bnot\b/g, '')); const rightCore = normal(right.text.replace(/\bnot\b/g, ''));
    if (leftCore === rightCore && /\bnot\b/.test(left.text) !== /\bnot\b/.test(right.text)) {
      findings.push(finding(right.claim, 'draft_contradiction', 'error', 'This draft claim contradicts an earlier draft claim.', fallbackEvidence(sourceLines), 'high', 'Resolve the two claims before publishing.'));
    }
  }
  const claimKey = (item: FactFinding) => `${item.draftLocation.start}:${item.draftLocation.end}`;
  const unsupported = new Set(findings.filter((item) => item.kind === 'unsupported_claim').map(claimKey)).size;
  const contradicted = new Set(findings.filter((item) => ['draft_contradiction', 'number_drift', 'date_drift', 'entity_drift', 'quote_drift', 'capability_drift', 'semantic_contradiction'].includes(item.kind)).map(claimKey)).size;
  const humanReview = new Set(findings.filter((item) => item.severity === 'needs_human_review' || item.severity === 'warning').map(claimKey)).size;
  const checked = claims.filter((claim) => !claim.kinds.includes('opinion')).length;
  const affected = new Set(findings.map(claimKey)).size;
  return { version: '1', summary: { checked, supported: Math.max(0, checked - affected), unsupported, contradicted, humanReview }, claims, findings, skippedChecks: semanticAdapter ? [] : ['semantic_matching'] };
}

export function formatFactLintReport(report: FactLintReport): string {
  const lines = [`fact lint: ${report.summary.checked} checked, ${report.summary.supported} supported, ${report.findings.length} findings`];
  for (const item of report.findings) lines.push(`${item.severity} ${item.kind} s${item.draftLocation.sentence} [${item.evidence[0]?.sourceId ?? 'no-source'}]: ${item.reason}`);
  if (report.skippedChecks.length) lines.push(`skipped: ${report.skippedChecks.join(', ')}`);
  return lines.join('\n');
}

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
interface SourceSentence { source: FactSource; text: string; terms: Set<string>; }

function sourceSentences(sources: FactSource[]): SourceSentence[] {
  return sources.flatMap((source) => sentences(source.text).map((sentence) => ({
    source, text: sentence.text, terms: new Set(tokens(sentence.text)),
  })));
}

function hasOverlap(claimTerms: string[], source: SourceSentence): boolean {
  return claimTerms.length > 0 && claimTerms.filter((term) => source.terms.has(term)).length / claimTerms.length >= 0.8;
}
function dates(value: string): string[] { return [...value.matchAll(DATE)].map((match) => new Date(match[0]).toISOString().slice(0, 10)).filter((value) => value !== ''); }
function numbers(value: string): string[] { return value.match(/\b\d+(?:\.\d+)?\s*(?:%|days?|hours?|weeks?|months?|years?)?\b/gi) ?? []; }
function numberContext(value: string): string {
  return normal(numbers(value).reduce((text, number) => text.replace(number, 'QUANTITY'), value));
}
function negated(value: string): boolean { return /\b(?:does not|do not|did not|is not|are not|cannot|can't|won't|not)\b/i.test(value); }
const NON_ENTITIES = new Set(['A', 'An', 'And', 'After', 'As', 'At', 'But', 'For', 'From', 'He', 'I', 'In', 'It', 'Its', 'On', 'Or', 'She', 'The', 'This', 'That', 'They', 'We', 'With', 'You']);
const NUMBER_WORDS = /^(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?$/i;
const CAPABILITY = /\b(?:exports?|supports|includes?|works with|can\s+(?:export|support|include)|(?:does not|do not|did not|is not|are not)\s+support)\s+([^.!?]+)/gi;
const CAPABILITY_FILLER = new Set(['a', 'an', 'as', 'data', 'file', 'files', 'report', 'reports', 'the']);
const CAPABILITY_FORMATS = new Set(['csv', 'json', 'pdf', 'xml']);
function entities(value: string): string[] {
  return (value.match(/\b[A-Z][\p{L}\p{M}'-]*(?:\s+[A-Z][\p{L}\p{M}'-]+)?\b/gu) ?? []).filter((entity) => !NON_ENTITIES.has(entity) && !NUMBER_WORDS.test(entity) && entity !== entity.toUpperCase());
}
function entityContext(value: string): string {
  return numberContext(entities(value).reduce((text, entity) => text.replace(entity, 'ENTITY'), value));
}
function hasEntityEvidence(claim: string, source: string, sourceLines: SourceSentence[]): boolean {
  const sourceNames = entities(source);
  return entities(claim).every((name, index) => {
    const sourceName = sourceNames[index];
    if (!sourceName) return false;
    if (name === sourceName || (name.includes(' ') && sourceName.includes(' '))) return true;
    if (sourceLines.some(({ text }) => entities(text).includes(sourceName) && text.indexOf(sourceName) > 0)) return true;
    const productTypo = capabilityObjects(source).length > 0 && name.length >= 4 && name.length === sourceName.length
      && [...name].filter((letter, position) => letter !== sourceName[position]).length === 1;
    return productTypo;
  });
}
function capabilityObjects(text: string): string[][] {
  return [...text.matchAll(CAPABILITY)].map((match) => [...new Set(tokens(match[1]).map((token) => token.replace(/s$/, '')).filter((token) => !CAPABILITY_FILLER.has(token)))]).filter((items) => items.length > 0);
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
function evidenceFor(lines: SourceSentence[]): FactEvidence[] {
  return lines.map(({ source, text }) => evidence(source, text));
}

function fallbackEvidence(sources: SourceSentence[]): FactEvidence[] {
  return evidenceFor(sources.slice(0, 1));
}
function finding(claim: FactClaim, kind: FactFindingKind, severity: FactSeverity, reason: string, evidenceItems: FactEvidence[], confidence: FactFinding['confidence'], suggestedAction: string): FactFinding {
  return { severity, kind, claim: claim.text, draftLocation: { sentence: claim.sentence, start: claim.start, end: claim.end }, reason, evidence: evidenceItems, confidence, suggestedAction };
}

export function extractFactClaims(draft: string): FactClaim[] {
  const output = sentences(draft).filter((sentence) => !/^that['’]s it[.!]?$/i.test(sentence.text.trim())).map((sentence) => ({ text: sentence.text, sentence: sentence.index, start: sentence.start, end: sentence.end, kinds: kindFor(sentence.text) }));
  for (const match of draft.matchAll(/["“]([^"”]+)["”]/g)) {
    const start = match.index ?? 0; const containing = output.find((claim) => claim.start <= start && claim.end >= start) ?? output.find((claim) => claim.start <= start) ?? output[0];
    if (containing) output.push({ text: match[0], sentence: containing.sentence, start, end: start + match[0].length, kinds: ['attribution_quote'] });
  }
  return output;
}

function capabilityFinding(claim: FactClaim, relevant: SourceSentence[], evidenceItems: FactEvidence[]): FactFinding | undefined {
  const claimCapabilities = capabilityObjects(claim.text);
  if (!claimCapabilities.length || !relevant.length) return undefined;
  const sourceCapabilities = relevant.flatMap(({ text }) => capabilityObjects(text));
  const supported = claimCapabilities.every((capability) => sourceCapabilities.some((sourceCapability) => capability.every((token) => sourceCapability.includes(token))));
  if (supported && relevant.some(({ text }) => negated(text) !== negated(claim.text))) {
    return finding(claim, 'capability_drift', 'error', 'The draft reverses the source capability.', evidenceItems, 'high', 'Match the source capability polarity or cite contrary evidence.');
  }
  if (supported) return undefined;
  const formatMismatch = claimCapabilities.some((capability) => {
    const claimFormats = capability.filter((token) => CAPABILITY_FORMATS.has(token));
    return claimFormats.length > 0 && sourceCapabilities.some((sourceCapability) => {
      const sourceFormats = sourceCapability.filter((token) => CAPABILITY_FORMATS.has(token));
      return sourceFormats.length > 0 && claimFormats.some((format) => !sourceFormats.includes(format));
    });
  });
  if (formatMismatch) {
    return finding(claim, 'capability_drift', 'error', 'The product capability differs from the supplied source.', evidenceItems, 'high', 'Match the source capability or cite contrary evidence.');
  }
  return finding(claim, 'missing_evidence', 'needs_human_review', 'The product capability is not established by the relevant source wording.', evidenceItems, 'medium', 'Confirm the capability with a reviewer or add evidence.');
}

function findingsForClaim(claim: FactClaim, input: FactLintInput, sourceLines: SourceSentence[], semanticAdapter: SemanticAdapter | undefined): FactFinding[] {
  const claimTerms = tokens(claim.text);
  const relevant = sourceLines.filter((source) => claimTerms.some((term) => source.terms.has(term)));
  const same = sourceLines.find((source) => hasOverlap(claimTerms, source));
  const evidenceItems = relevant.length ? evidenceFor(relevant.slice(0, 2)) : fallbackEvidence(sourceLines);
  const quote = claim.text.match(QUOTE)?.[1];
  const sourceHasAttribution = input.sources.some((source) => /\b(said|according to|reported)\b/i.test(source.text));
  const enclosingSentence = sentences(input.draft).find((sentence) => sentence.start <= claim.start && sentence.end >= claim.start);
  const claimHasAttribution = /\b(said|according to|reported)\b/i.test(enclosingSentence?.text ?? claim.text);
  if (quote && claimHasAttribution && sourceHasAttribution && !input.sources.some((source) => source.text.includes(quote))) {
    const quoteRelevant = sourceLines.filter(({ text }) => /\b(said|according to|reported)\b/i.test(text));
    const quoteEvidence = quoteRelevant.length ? evidenceFor(quoteRelevant.slice(0, 2)) : input.sources.slice(0, 1).map((source) => evidence(source, source.text));
    return [finding(claim, 'quote_drift', 'error', 'The quoted wording differs from the supplied source.', quoteEvidence, 'high', 'Use the source wording or label the text as a paraphrase.')];
  }

  const claimDates = dates(claim.text);
  const sourceDates = relevant.flatMap(({ text }) => dates(text));
  const claimNumbers = numbers(claim.text);
  const sourceNumbers = relevant.flatMap(({ text }) => numbers(text));
  if (!claimDates.length && (!claim.kinds.includes('attribution_quote') || (quote && !claimHasAttribution)) && claimNumbers.length && sourceNumbers.length && claimNumbers.some((number) => !sourceNumbers.some((sourceNumber) => normal(sourceNumber) === normal(number)))) {
    const matching = relevant.filter(({ text }) => numberContext(text) === numberContext(claim.text));
    if (matching.length) {
      return [finding(claim, 'number_drift', 'error', 'A number or unit differs in otherwise matching source wording.', evidenceFor(matching.slice(0, 2)), 'high', 'Correct the number or unit, or cite a newer source.')];
    }
    return [finding(claim, 'missing_evidence', 'needs_human_review', 'The number is absent from related source wording, but the source relation does not match closely enough to establish a contradiction.', evidenceItems, 'low', 'Check whether the number is derived, paraphrased, or unsupported before changing it.')];
  }
  if (claimDates.length && sourceDates.length && claimDates.some((date) => !sourceDates.includes(date))) {
    return [finding(claim, 'date_drift', 'error', 'The draft date differs from relevant source evidence.', evidenceItems, 'high', 'Correct the date or cite a newer source.')];
  }

  const claimEntities = entities(claim.text);
  const sourceEntities = relevant.flatMap(({ text }) => entities(text));
  if (claimEntities.length && sourceEntities.length && claimEntities.some((entity) => !sourceEntities.some((sourceEntity) => normal(sourceEntity) === normal(entity)))) {
    const matching = relevant.filter(({ text }) => entityContext(text) === entityContext(claim.text) && hasEntityEvidence(claim.text, text, sourceLines));
    if (matching.length) {
      return [finding(claim, 'entity_drift', 'error', 'A named entity differs in otherwise matching source wording.', evidenceFor(matching.slice(0, 2)), 'high', 'Correct the name or cite the source that supports it.')];
    }
    return [finding(claim, 'missing_evidence', 'needs_human_review', 'Capitalized wording differs, but matching context does not establish an entity substitution.', evidenceItems, 'low', 'Review the wording and source context before changing names.')];
  }

  const capability = capabilityFinding(claim, relevant, evidenceItems);
  if (capability) return [capability];
  if (capabilityObjects(claim.text).length && relevant.length) return [];

  const overreach: FactFinding[] = [];
  if (claim.kinds.includes('causal') && relevant.length && !relevant.some(({ text }) => /\b(caused?|because|led to|resulted in)\b/i.test(text))) {
    overreach.push(finding(claim, 'causal_overreach', 'warning', 'The sources describe an outcome but do not establish causation.', evidenceItems, 'medium', 'Use an association claim or add causal evidence.'));
  }
  if (claim.kinds.includes('comparative') && relevant.length && !relevant.some(({ text }) => /\b(better|more|less|than|best|largest|fastest)\b/i.test(text))) {
    overreach.push(finding(claim, 'comparative_overreach', 'warning', 'The sources do not establish the comparison.', evidenceItems, 'medium', 'Narrow the comparison or add comparative evidence.'));
  }
  if (overreach.length) return overreach;
  if (claimDates.some((date) => sourceDates.includes(date)) || same) return [];

  if (claim.kinds.includes('number') && !sourceLines.some(({ text }) => numbers(text).length)) {
    return [finding(claim, 'unsupported_claim', 'error', 'No supplied source supports this checkable claim.', evidenceItems, 'medium', 'Add a source, remove the claim, or mark it as an approved hypothesis.')];
  }

  if (quote && !claimHasAttribution) {
    return [finding(claim, 'missing_evidence', 'needs_human_review', 'The quotation is not attributed; deterministic matching cannot distinguish a rhetorical label from a sourced quotation.', evidenceItems, 'low', 'Review the quotation in context and attribute it if it presents source wording.')];
  }

  const semantic = semanticAdapter?.compare({ claim: claim.text, sources: input.sources });
  if (semantic === 'supported') return [];
  if (semantic === 'contradicted') {
    return [finding(claim, 'semantic_contradiction', 'error', 'The configured semantic adapter found contradictory source evidence.', evidenceItems, 'medium', 'Review the cited sources and correct or qualify the claim.')];
  }
  return [finding(claim, 'missing_evidence', 'needs_human_review', 'Deterministic matching could not establish support; lexical differences alone do not establish a factual error.', evidenceItems, 'low', 'Review the source context or enable an approved semantic adapter.')];
}

function draftContradictions(claims: FactClaim[], sourceLines: SourceSentence[]): FactFinding[] {
  const normalized = claims.filter((claim) => !/^["“][\s\S]*["”]$/.test(claim.text.trim())).map((claim) => {
    const text = normal(claim.text);
    return { claim, core: normal(text.replace(/\bnot\b/g, '')), negated: /\bnot\b/.test(text) };
  });
  const byCore = new Map<string, number[]>();
  normalized.forEach(({ core }, index) => {
    const indexes = byCore.get(core) ?? [];
    indexes.push(index);
    byCore.set(core, indexes);
  });
  const findings: FactFinding[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const left = normalized[index];
    for (const other of byCore.get(left.core)!) {
      const right = normalized[other];
      if (other > index && left.negated !== right.negated) {
        findings.push(finding(right.claim, 'draft_contradiction', 'error', 'This draft claim contradicts an earlier draft claim.', fallbackEvidence(sourceLines), 'high', 'Resolve the two claims before publishing.'));
      }
    }
  }
  return findings;
}

const CONTRADICTIONS = new Set<FactFindingKind>(['draft_contradiction', 'number_drift', 'date_drift', 'entity_drift', 'quote_drift', 'capability_drift', 'semantic_contradiction']);

function summarizeFindings(claims: FactClaim[], findings: FactFinding[]): FactLintReport['summary'] {
  const unsupported = new Set<string>();
  const contradicted = new Set<string>();
  const humanReview = new Set<string>();
  const affected = new Set<string>();
  for (const item of findings) {
    const key = `${item.draftLocation.start}:${item.draftLocation.end}`;
    affected.add(key);
    if (item.kind === 'unsupported_claim') unsupported.add(key);
    if (CONTRADICTIONS.has(item.kind)) contradicted.add(key);
    if (item.severity === 'needs_human_review' || item.severity === 'warning') humanReview.add(key);
  }
  const checked = claims.filter((claim) => !claim.kinds.includes('opinion')).length;
  return { checked, supported: Math.max(0, checked - affected.size), unsupported: unsupported.size, contradicted: contradicted.size, humanReview: humanReview.size };
}

export function lintFacts(input: FactLintInput): FactLintReport {
  if (!input.sources.length) throw new Error('Fact lint requires at least one source document.');
  if (!input.sources.every((source) => source.id.trim() && source.text.trim())) throw new Error('Every fact-lint source needs a non-empty id and text.');
  const claims = extractFactClaims(input.draft);
  const sourceLines = sourceSentences(input.sources);
  const findings: FactFinding[] = [];
  const semanticAdapter = input.semanticAdapter && (!input.semanticAdapter.external || input.allowExternalSemantic) ? input.semanticAdapter : undefined;
  const approved = new Set(input.metadata?.approvedHypotheses?.map(normal) ?? []);
  const allowed = new Set(input.metadata?.allowedAssumptions?.map(normal) ?? []);
  for (const claim of claims) {
    if (claim.kinds.includes('opinion') || allowed.has(normal(claim.text)) || (claim.kinds.includes('hypothesis') && approved.has(normal(claim.text)))) continue;
    findings.push(...findingsForClaim(claim, input, sourceLines, semanticAdapter));
  }
  findings.push(...draftContradictions(claims, sourceLines));
  return { version: '1', summary: summarizeFindings(claims, findings), claims, findings, skippedChecks: semanticAdapter ? [] : ['semantic_matching'] };
}

export function formatFactLintReport(report: FactLintReport): string {
  const lines = [`fact lint: ${report.summary.checked} checked, ${report.summary.supported} supported, ${report.findings.length} findings`];
  for (const item of report.findings) lines.push(`${item.severity} ${item.kind} s${item.draftLocation.sentence} [${item.evidence[0]?.sourceId ?? 'no-source'}]: ${item.reason}`);
  if (report.skippedChecks.length) lines.push(`skipped: ${report.skippedChecks.join(', ')}`);
  return lines.join('\n');
}

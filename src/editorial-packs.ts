import type { ArgumentMap, BatchFinding, BatchReport, EngineReport, Finding, Sentence, Severity, WritingBrief, WritingFormat } from './contracts.js';
import { paragraphs, sentences, words } from './text.js';

const formats: WritingFormat[] = ['general', 'social', 'deck', 'outreach', 'blog', 'audit', 'website'];
const evidenceStatuses = ['primary', 'attributed', 'internal', 'unverified'] as const;

function isText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}

function isTerms(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every((term) => isText(term, 200));
}
function isFactSources(value: unknown): value is Array<{ id: string; text: string }> {
  return Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every((source) => !!source && typeof source === 'object' && isText((source as { id?: unknown }).id, 100) && isText((source as { text?: unknown }).text, 100_000));
}
function isFactMetadata(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const metadata = value as { allowedAssumptions?: unknown; approvedHypotheses?: unknown };
  return (metadata.allowedAssumptions === undefined || isTerms(metadata.allowedAssumptions)) && (metadata.approvedHypotheses === undefined || isTerms(metadata.approvedHypotheses));
}

function isArgumentMap(value: unknown): value is ArgumentMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const map = value as Partial<ArgumentMap>;
  return isText(map.observation, 500) && isText(map.mechanism, 500) && isText(map.consequence, 500) && isText(map.readerValue, 500);
}

export function parseWritingBrief(value: unknown): WritingBrief {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('WritingBrief must be a JSON object.');
  const brief = value as Partial<WritingBrief>;
  if (brief.version !== '1' || !isText(brief.audience, 500) || !isText(brief.intent, 500) || !formats.includes(brief.format as WritingFormat)
    || (brief.readerKnowsAuthor !== undefined && typeof brief.readerKnowsAuthor !== 'boolean')
    || (brief.vocabulary !== undefined && !isTerms(brief.vocabulary))
    || (brief.prohibitedTerms !== undefined && !isTerms(brief.prohibitedTerms))
    || (brief.title !== undefined && !isText(brief.title, 500))
    || (brief.evidenceStatus !== undefined && !evidenceStatuses.includes(brief.evidenceStatus))
    || (brief.argumentMap !== undefined && !isArgumentMap(brief.argumentMap))
    || (brief.factSources !== undefined && !isFactSources(brief.factSources))
    || (brief.factMetadata !== undefined && !isFactMetadata(brief.factMetadata))) {
    throw new Error('WritingBrief needs version "1", audience, intent, a known format, and optional bounded context fields.');
  }
  return brief as WritingBrief;
}

function meaningfulTerms(value: string): string[] {
  return [...new Set(words(value.toLowerCase()).filter((word) => word.length > 3 && !['that', 'this', 'with', 'from', 'your', 'when', 'what', 'into', 'their'].includes(word)))];
}

function finding(id: string, severity: Severity, sentence: number, excerpt: string, reason: string, suggestion: string): Finding {
  return { engine: 'editorial', id, severity, sentence, excerpt, reason, suggestion };
}

function formatFindings(text: string, draftSentences: Sentence[], brief: WritingBrief): Finding[] {
  const findings: Finding[] = [];
  const first = draftSentences[0];

  if (brief.evidenceStatus === 'unverified' && first) {
    findings.push(finding('editorial.evidence.unverified', 'yellow', first.index, first.text, 'The brief marks the source state as unverified.', 'Keep attribution explicit and verify the source before treating the claim as established.'));
  }

  if (brief.argumentMap && first) {
    const expected = meaningfulTerms(brief.argumentMap.readerValue);
    const draftWords = new Set(words(text.toLowerCase()));
    const matchedTerms = expected.filter((term) => draftWords.has(term)).length;
    const requiredTerms = expected.length === 1 ? 1 : Math.min(2, expected.length);
    if (expected.length && matchedTerms < requiredTerms) {
      findings.push(finding('editorial.argument-map.reader-value-missing', 'yellow', first.index, first.text, 'The draft does not carry a concrete reader-value cue from the brief.', 'Connect the observation to the operational consequence the reader can act on.'));
    }
  }

  if (brief.format === 'social') {
    for (const sentence of draftSentences) {
      if (/^(a pattern|a theme|something) i (keep )?(seeing|noticing)\b/i.test(sentence.text)) {
        findings.push(finding('editorial.social.generic-opener', 'yellow', sentence.index, sentence.text, 'Uses a generic observation opener that often reads as templated.', 'Open from the concrete observation or claim instead.'));
      }
    }
    const draftParagraphs = paragraphs(text);
    const allSingleSentence = draftParagraphs.length >= 3 && draftParagraphs.every((paragraph) => sentences(paragraph).length === 1);
    if (allSingleSentence && first) findings.push(finding('editorial.social.one-line-run', 'yellow', first.index, first.text, 'Every paragraph contains one sentence.', 'Combine related sentences where the writing needs a fuller rhythm.'));
  }

  if (brief.format === 'deck') {
    if (first && /^we\b/i.test(first.text)) findings.push(finding('editorial.deck.first-slide-we', 'yellow', first.index, first.text, 'The opening starts with the company rather than the reader or claim.', 'Lead with the reader context or the slide claim.'));
    if (brief.title && /^\s*\d/.test(brief.title)) findings.push(finding('editorial.deck.numeric-title', 'yellow', 1, brief.title, 'The title starts with a number.', 'State the slide claim without leading with a count.'));
  }

  if (brief.format === 'outreach') {
    for (const sentence of draftSentences) {
      if (/\b(would you be open to|does that sound interesting|what do you think)\??$/i.test(sentence.text)) {
        findings.push(finding('editorial.outreach.generic-question-cta', 'yellow', sentence.index, sentence.text, 'Uses a stock outbound question CTA.', 'Close with a specific next step or a direct observation.'));
      }
    }
  }
  return findings;
}

export function analyzeEditorial(text: string, brief: WritingBrief): EngineReport {
  const draftSentences = sentences(text);
  const findings = formatFindings(text, draftSentences, brief);
  const prohibitedTerms = (brief.prohibitedTerms ?? []).map((term) => [term, normalizedWords(term)] as const).filter(([, term]) => term);
  for (const sentence of draftSentences) {
    const normalizedSentence = normalizedWords(sentence.text);
    for (const [term, normalizedTerm] of prohibitedTerms) {
      if (normalizedTerm && ` ${normalizedSentence} `.includes(` ${normalizedTerm} `)) {
        findings.push(finding('editorial.prohibited-term', 'red', sentence.index, sentence.text, `Uses prohibited term: ${term}.`, 'Remove the term or replace it with approved wording.'));
      }
    }
  }
  const red = findings.filter((item) => item.severity === 'red').length;
  const yellow = findings.length - red;
  return { engine: 'editorial', version: '1', score: Math.max(0, 100 - red * 25 - yellow * 6), passed: red === 0, findings };
}

function normalizedWords(text: string): string {
  return words(text.toLowerCase()).join(' ');
}

function normalizedBoundary(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const normalized = normalizedWords(text);
  return normalized || undefined;
}

function duplicateBoundary(id: BatchFinding['id'], boundaries: Array<string | undefined>, reason: string, suggestion: string): BatchFinding[] {
  const groups = new Map<string, number[]>();
  boundaries.forEach((boundary, index) => {
    if (boundary) {
      const indexes = groups.get(boundary) ?? [];
      indexes.push(index + 1);
      groups.set(boundary, indexes);
    }
  });
  return [...groups.values()].filter((indexes) => indexes.length > 1).map((draftIndexes) => ({ id, severity: 'yellow', draftIndexes, reason, suggestion }));
}

export function analyzeBatch(drafts: string[]): BatchReport {
  if (drafts.length < 2 || drafts.length > 100 || drafts.some((draft) => !isText(draft, 100_000))) throw new Error('Batch analysis needs 2 to 100 non-empty drafts.');
  const parsed = drafts.map(sentences);
  return {
    version: '1',
    findings: [
      ...duplicateBoundary('batch.repeated-opening', parsed.map((draft) => normalizedBoundary(draft[0]?.text)), 'Drafts share the same opening sentence.', 'Vary the opening shape or lead with a different concrete observation.'),
      ...duplicateBoundary('batch.repeated-ending', parsed.map((draft) => normalizedBoundary(draft.at(-1)?.text)), 'Drafts share the same closing sentence.', 'Give each draft a closing beat that fits its own argument.'),
    ],
    passed: true,
  };
}

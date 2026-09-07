import { basename } from 'node:path';
import { sentences } from './text.js';

export interface LocalWritingExampleInput {
  basename: string;
  text: string;
}

export interface LocalWritingExcerpt {
  source: string;
  text: string;
}

const STOP_WORDS = new Set(['the', 'and', 'that', 'with', 'this', 'from', 'your', 'have', 'were', 'they', 'will', 'into', 'about', 'what', 'when', 'where', 'then', 'than']);
const REDACTIONS: Array<[string, RegExp]> = [
  ['EMAIL', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['PHONE', /(?<!\w)(?:\+?\d[\d .()/-]{7,}\d)(?!\w)/g],
  ['CARD', /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g],
  ['IP', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  ['URL', /\bhttps?:\/\/[^\s<>()]+/gi],
];

function tokens(text: string): string[] {
  return (text.toLocaleLowerCase().match(/\p{L}[\p{L}\p{N}'’-]*/gu) ?? []).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function redact(text: string): string {
  let output = text;
  for (const [kind, expression] of REDACTIONS) output = output.replace(expression, `[REDACTED:${kind}]`);
  return output.replace(/\s+/g, ' ').trim().slice(0, 480);
}

function validate(inputs: LocalWritingExampleInput[]): void {
  if (!inputs.length || inputs.length > 64) throw new Error('Writing example lookup needs one to 64 explicit local samples.');
  for (const input of inputs) {
    if (!input.text.trim() || input.text.length > 100_000) throw new Error('Every writing example must contain at most 100,000 characters of text.');
    if (!input.basename || basename(input.basename) !== input.basename || input.basename.length > 160) throw new Error('Writing example sources must use basenames only.');
  }
}

interface IndexedSentence {
  source: string;
  position: number;
  text: string;
  terms: string[];
}

/** Builds an explicit in-memory inverted index; it is never written or retained. */
function indexExamples(inputs: LocalWritingExampleInput[]): { entries: IndexedSentence[]; postings: Map<string, Map<number, number>> } {
  const entries = inputs.flatMap((input) => sentences(input.text).map((sentence, position) => ({ source: input.basename, position, text: sentence.text, terms: tokens(sentence.text) })));
  const postings = new Map<string, Map<number, number>>();
  for (const [entryIndex, entry] of entries.entries()) {
    for (const term of entry.terms) {
      const posting = postings.get(term) ?? new Map<number, number>();
      posting.set(entryIndex, (posting.get(entryIndex) ?? 0) + 1); postings.set(term, posting);
    }
  }
  return { entries, postings };
}

/** Finds redacted local examples in supplied memory only; it never creates a corpus or index on disk. */
export function findWritingExamples(query: string, inputs: LocalWritingExampleInput[], limit = 3): LocalWritingExcerpt[] {
  validate(inputs);
  const queryTokens = new Set(tokens(query));
  if (!queryTokens.size) return [];
  const index = indexExamples(inputs); const scores = new Map<number, number>();
  const averageLength = index.entries.reduce((sum, entry) => sum + entry.terms.length, 0) / Math.max(1, index.entries.length);
  for (const term of queryTokens) {
    const posting = index.postings.get(term); if (!posting) continue;
    const idf = Math.log(1 + (index.entries.length - posting.size + 0.5) / (posting.size + 0.5));
    for (const [entryIndex, frequency] of posting) {
      const entry = index.entries[entryIndex]!; const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * entry.terms.length / Math.max(1, averageLength));
      scores.set(entryIndex, (scores.get(entryIndex) ?? 0) + idf * frequency * 2.2 / denominator);
    }
  }
  const ranked = [...scores].map(([entryIndex, score]) => ({ ...index.entries[entryIndex]!, score })).sort((left, right) => right.score - left.score || left.source.localeCompare(right.source) || left.position - right.position);
  const usedSources = new Set<string>();
  const excerpts: LocalWritingExcerpt[] = [];
  for (const candidate of ranked) {
    if (usedSources.has(candidate.source)) continue;
    const text = redact(candidate.text);
    if (!text) continue;
    excerpts.push({ source: candidate.source, text }); usedSources.add(candidate.source);
    if (excerpts.length === Math.min(3, Math.max(1, limit))) break;
  }
  return excerpts;
}

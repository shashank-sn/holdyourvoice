import type { CopySpec, LexicalResidualReportV1, RecompositionPolicyV1, WritingBrief } from './contracts.js';
import { canonicalJson } from './canonical-json.js';
import { words } from './text.js';

const ACKNOWLEDGEMENT = 'Measures shared wording only; does not detect or prove removal of a watermark.' as const;
const STATEMENT = 'Lexical overlap is not a watermark detector.' as const;

function tokens(text: string): string[] {
  return words(text.normalize('NFKC')).map((word) => word.toLowerCase());
}

function ngrams(value: string[], size: number): string[] {
  const result: string[] = [];
  for (let index = 0; index + size <= value.length; index += 1) result.push(value.slice(index, index + size).join('\u0001'));
  return result;
}

function allowedPhrases(copySpec: CopySpec): Array<{ reason: 'copy-spec-claim' | 'copy-spec-atom'; text: string }> {
  const result: Array<{ reason: 'copy-spec-claim' | 'copy-spec-atom'; text: string }> = [];
  for (const claim of copySpec.claims) {
    if (claim.atoms?.length) result.push(...claim.atoms.map((text) => ({ reason: 'copy-spec-atom' as const, text })));
    else result.push({ reason: 'copy-spec-claim', text: claim.text });
  }
  return result;
}

function longestSharedRun(source: string[], candidate: string[], allowed: Set<string>): number {
  let longest = 0;
  let previous = new Array<number>(source.length + 1).fill(0);
  for (let candidateIndex = 1; candidateIndex <= candidate.length; candidateIndex += 1) {
    const current = new Array<number>(source.length + 1).fill(0);
    for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
      if (candidate[candidateIndex - 1] !== source[sourceIndex - 1]) continue;
      current[sourceIndex] = previous[sourceIndex - 1]! + 1;
      const run = current[sourceIndex]!;
      const key = candidate.slice(candidateIndex - run, candidateIndex).join('\u0001');
      if (!allowed.has(key)) longest = Math.max(longest, run);
    }
    previous = current;
  }
  return longest;
}

export function parseRecompositionPolicy(value: unknown): RecompositionPolicyV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Recomposition policy must be an object.');
  const policy = value as Partial<RecompositionPolicyV1>;
  const residual = policy.lexicalResidual;
  if (policy.version !== '1' || policy.mode !== 'meaning-first' || policy.acknowledgement !== ACKNOWLEDGEMENT
    || !residual || residual.ngramSize !== 5
    || typeof residual.maxSharedNgramFraction !== 'number' || !Number.isFinite(residual.maxSharedNgramFraction) || residual.maxSharedNgramFraction < 0 || residual.maxSharedNgramFraction > 1
    || !Number.isInteger(residual.maxLongestSharedRunTokens) || residual.maxLongestSharedRunTokens < 0 || residual.maxLongestSharedRunTokens > 100_000) {
    throw new Error('Recomposition policy is not valid.');
  }
  return policy as RecompositionPolicyV1;
}

export function buildRecompositionBrief(copySpec: CopySpec, writingBrief?: WritingBrief): string {
  return [
    '# Meaning-first recomposition contract',
    'Write a new whole-document candidate from the structured facts and constraints below.',
    'Do not edit, quote, or mirror source wording unless a CopySpec claim or atom requires it.',
    'Return only the candidate. Do not claim anything about authorship, AI origin, or watermark status.',
    '',
    '# CopySpec',
    canonicalJson({ audience: copySpec.audience, intent: copySpec.intent, channel: copySpec.channel, claims: copySpec.claims, ...(copySpec.prohibitedClaims ? { prohibitedClaims: copySpec.prohibitedClaims } : {}) }),
    ...(writingBrief ? ['', '# WritingBrief', canonicalJson(writingBrief)] : []),
  ].join('\n');
}

export function measureLexicalResidual(sourceText: string, candidateText: string, copySpec: CopySpec, policy: RecompositionPolicyV1): LexicalResidualReportV1 {
  const source = tokens(sourceText);
  const candidate = tokens(candidateText);
  const allowed = allowedPhrases(copySpec);
  const allowedNgrams = new Set<string>();
  const allowedRuns = new Set<string>();
  const counts = new Map<'copy-spec-claim' | 'copy-spec-atom', number>();
  for (const phrase of allowed) {
    const phraseTokens = tokens(phrase.text);
    counts.set(phrase.reason, (counts.get(phrase.reason) ?? 0) + phraseTokens.length);
    for (const ngram of ngrams(phraseTokens, policy.lexicalResidual.ngramSize)) allowedNgrams.add(ngram);
    for (let length = 1; length <= phraseTokens.length; length += 1) {
      for (let index = 0; index + length <= phraseTokens.length; index += 1) allowedRuns.add(phraseTokens.slice(index, index + length).join('\u0001'));
    }
  }
  const sourceNgrams = new Set(ngrams(source, policy.lexicalResidual.ngramSize).filter((ngram) => !allowedNgrams.has(ngram)));
  const candidateNgrams = ngrams(candidate, policy.lexicalResidual.ngramSize).filter((ngram) => !allowedNgrams.has(ngram));
  const shared = candidateNgrams.filter((ngram) => sourceNgrams.has(ngram)).length;
  const sharedNgramFraction = candidateNgrams.length === 0 ? 0 : shared / candidateNgrams.length;
  const longestSharedRunTokens = longestSharedRun(source, candidate, allowedRuns);
  const passed = sharedNgramFraction <= policy.lexicalResidual.maxSharedNgramFraction
    && longestSharedRunTokens <= policy.lexicalResidual.maxLongestSharedRunTokens;
  return {
    version: '1', sourceTokenCount: source.length, candidateTokenCount: candidate.length, ngramSize: policy.lexicalResidual.ngramSize,
    sharedNgramFraction, longestSharedRunTokens,
    allowedResiduals: [...counts.entries()].map(([reason, count]) => ({ reason, count })),
    passed, statement: STATEMENT,
  };
}

import { analyzeAiEditor } from './ai-editor.js';
import { profileMetrics } from './voice-dna.js';
import { words } from './text.js';

export interface EvalParagraph { paragraphId: string; text: string; }
export interface LocalEvalReportV1 {
  version: '1';
  split: { trainParagraphIds: string[]; testParagraphIds: string[] };
  authorshipTfIdfLogReg: { candidateUserProbability: number; trainExamples: number } | { disposition: 'abstain'; reason: string };
  contentF1: number;
  aiTellReduction: { inputFindings: number; candidateFindings: number; reduction: number };
  stylometricCosine9: number;
}

const STOP = new Set(['the', 'and', 'that', 'with', 'this', 'from', 'your', 'have', 'were', 'they', 'will', 'into', 'about']);
function terms(text: string): string[] { return words(text.toLowerCase()).filter((word) => word.length > 2 && !STOP.has(word)); }
function f1(left: string, right: string): number {
  const a = new Set(terms(left)); const b = new Set(terms(right)); const intersection = [...a].filter((word) => b.has(word)).length;
  return a.size + b.size === 0 ? 1 : Number((2 * intersection / (a.size + b.size)).toFixed(3));
}
function vector(text: string): number[] {
  const m = profileMetrics(text); const punctuation = Object.values(m.punctuation).reduce((sum, value) => sum + value, 0);
  return [m.sentenceLength, m.sentenceVariation, m.rhythm, m.paragraphLength, m.lexicalDensity, m.questionRate, punctuation, m.openingMoves.length, m.transitions.length];
}
function cosine(left: number[], right: number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * right[index]!, 0);
  const magnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0) * right.reduce((sum, value) => sum + value * value, 0));
  return Number((magnitude ? dot / magnitude : 0).toFixed(3));
}
function groupedParagraphs(values: EvalParagraph[], label: string): void {
  if (values.length < 2 || values.some((value) => !value.paragraphId || !value.text.trim()) || new Set(values.map((value) => value.paragraphId)).size < 2) throw new Error(`${label} needs at least two paragraph IDs with text.`);
}

interface SparseVector { [term: string]: number; }

function tfIdf(documents: string[]): { vocabulary: string[]; idf: Map<string, number>; vectors: SparseVector[] } {
  const documentTerms = documents.map((document) => terms(document));
  const df = new Map<string, number>();
  for (const document of documentTerms) for (const term of new Set(document)) df.set(term, (df.get(term) ?? 0) + 1);
  const vocabulary = [...df.keys()].sort();
  const idf = new Map([...df].map(([term, frequency]) => [term, Math.log((documents.length + 1) / (frequency + 1)) + 1]));
  const toVector = (document: string): SparseVector => {
    const termsInDocument = terms(document); const count = new Map<string, number>();
    for (const term of termsInDocument) count.set(term, (count.get(term) ?? 0) + 1);
    const vector: SparseVector = {};
    for (const [term, occurrences] of count) if (idf.has(term)) vector[term] = (occurrences / Math.max(1, termsInDocument.length)) * idf.get(term)!;
    return vector;
  };
  return {
    vocabulary,
    idf,
    vectors: documents.map(toVector),
  };
}

function vectorWithIdf(document: string, idf: Map<string, number>): SparseVector {
  const documentTerms = terms(document); const count = new Map<string, number>();
  for (const term of documentTerms) count.set(term, (count.get(term) ?? 0) + 1);
  const vector: SparseVector = {};
  for (const [term, occurrences] of count) if (idf.has(term)) vector[term] = (occurrences / Math.max(1, documentTerms.length)) * idf.get(term)!;
  return vector;
}

function sigmoid(value: number): number { return value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value)); }

/** Deterministic, train-only logistic regression over sparse TF-IDF vectors. */
function localAuthorshipProbability(candidate: string, user: EvalParagraph[], shadow: EvalParagraph[]): number {
  const training = [...user.map((item) => ({ text: item.text, label: 1 })), ...shadow.map((item) => ({ text: item.text, label: 0 }))];
  const transformed = tfIdf(training.map((item) => item.text));
  const weights: SparseVector = {}; let bias = 0;
  for (let epoch = 0; epoch < 80; epoch += 1) {
    for (let index = 0; index < training.length; index += 1) {
      const vector = transformed.vectors[index]!; const error = training[index]!.label - sigmoid(bias + Object.entries(vector).reduce((sum, [term, value]) => sum + (weights[term] ?? 0) * value, 0));
      bias += 0.12 * error;
      for (const [term, value] of Object.entries(vector)) weights[term] = (weights[term] ?? 0) + 0.12 * error * value;
    }
  }
  const candidateVector = vectorWithIdf(candidate, transformed.idf);
  const score = bias + Object.entries(candidateVector).reduce((sum, [term, value]) => sum + (weights[term] ?? 0) * value, 0);
  return Number(sigmoid(score).toFixed(3));
}

/** Optional local evaluation. Groups whole paragraph IDs before train/test to prevent variant leakage. */
export function evaluateLocalComposite(input: string, candidate: string, user: EvalParagraph[], aiShadow: EvalParagraph[]): LocalEvalReportV1 {
  groupedParagraphs(user, 'User paragraphs'); groupedParagraphs(aiShadow, 'AI-shadow paragraphs');
  const ids = [...new Set([...user, ...aiShadow].map((value) => value.paragraphId))].sort();
  const testIds = ids.filter((id, index) => index % 3 === 0); const trainIds = ids.filter((id) => !testIds.includes(id));
  const trainUser = user.filter((value) => trainIds.includes(value.paragraphId)); const trainShadow = aiShadow.filter((value) => trainIds.includes(value.paragraphId));
  const author = trainUser.length && trainShadow.length ? {
    candidateUserProbability: localAuthorshipProbability(candidate, trainUser, trainShadow),
    trainExamples: trainUser.length + trainShadow.length,
  } : { disposition: 'abstain' as const, reason: 'The paragraph-grouped split leaves no train examples for one class.' };
  const inputFindings = analyzeAiEditor(input).findings.length; const candidateFindings = analyzeAiEditor(candidate).findings.length;
  return { version: '1', split: { trainParagraphIds: trainIds, testParagraphIds: testIds }, authorshipTfIdfLogReg: author, contentF1: f1(input, candidate), aiTellReduction: { inputFindings, candidateFindings, reduction: inputFindings ? Number(((inputFindings - candidateFindings) / inputFindings).toFixed(3)) : 0 }, stylometricCosine9: cosine(vector(input), vector(candidate)) };
}

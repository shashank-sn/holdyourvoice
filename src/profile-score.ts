import type { Profile, ProfileChannel, VoiceDnaMetrics } from './contracts.js';
import { profileMetrics } from './voice-dna.js';
import { words } from './text.js';

const METRICS = ['sentenceLength', 'sentenceVariation', 'sentenceStructure', 'rhythm', 'paragraphLength', 'openingMoves', 'vocabulary', 'lexicalDensity', 'pointOfView', 'punctuation', 'caseStyle', 'questionRate', 'transitions'] as const;
type MetricName = typeof METRICS[number];

export interface ProfileScoreReportV1 {
  version: '1';
  disposition: 'inside_band' | 'review' | 'abstain';
  reason?: string;
  channel: ProfileChannel;
  candidateScore?: number;
  selfSimilarity?: { samplePairs: number; ceiling: 100; lowerBound: number; median: number };
  components?: Record<MetricName, number>;
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function rounded(value: number): number { return Number(value.toFixed(3)); }
function setSimilarity(left: string[], right: string[]): number {
  const a = new Set(left); const b = new Set(right);
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / new Set([...a, ...b]).size;
}
function numericSimilarity(left: number, right: number, scale: number): number {
  return clamp(1 - Math.abs(left - right) / Math.max(scale, Number.EPSILON));
}
function punctuationSimilarity(left: Record<string, number>, right: Record<string, number>): number {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const difference = [...keys].reduce((sum, key) => sum + Math.abs((left[key] ?? 0) - (right[key] ?? 0)), 0);
  const magnitude = [...keys].reduce((sum, key) => sum + Math.max(left[key] ?? 0, right[key] ?? 0), 0);
  return magnitude === 0 ? 1 : clamp(1 - difference / magnitude);
}
function componentScores(candidate: VoiceDnaMetrics, target: VoiceDnaMetrics): Record<MetricName, number> {
  return {
    sentenceLength: numericSimilarity(candidate.sentenceLength, target.sentenceLength, Math.max(8, target.sentenceLength * 0.75)),
    sentenceVariation: numericSimilarity(candidate.sentenceVariation, target.sentenceVariation, Math.max(4, target.sentenceVariation * 1.5)),
    sentenceStructure: setSimilarity(candidate.sentenceStructure, target.sentenceStructure),
    rhythm: numericSimilarity(candidate.rhythm, target.rhythm, Math.max(4, target.rhythm * 1.5)),
    paragraphLength: numericSimilarity(candidate.paragraphLength, target.paragraphLength, Math.max(2, target.paragraphLength)),
    openingMoves: setSimilarity(candidate.openingMoves, target.openingMoves),
    vocabulary: setSimilarity(candidate.vocabulary, target.vocabulary),
    lexicalDensity: numericSimilarity(candidate.lexicalDensity, target.lexicalDensity, 0.25),
    pointOfView: Number(candidate.pointOfView === target.pointOfView || target.pointOfView === 'mixed'),
    punctuation: punctuationSimilarity(candidate.punctuation, target.punctuation),
    caseStyle: Number(candidate.caseStyle === target.caseStyle || target.caseStyle === 'mixed'),
    questionRate: numericSimilarity(candidate.questionRate, target.questionRate, 0.25),
    transitions: setSimilarity(candidate.transitions, target.transitions),
  };
}
function score(components: Record<MetricName, number>): number {
  return rounded(100 * METRICS.reduce((sum, key) => sum + components[key], 0) / METRICS.length);
}
function sortedPercentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]!;
}
function languageConfidence(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  const latin = text.match(/\p{Script=Latin}/gu) ?? [];
  return words(text).length >= 20 && letters.length > 0 && latin.length / letters.length >= 0.8;
}

export function scoreHeldoutProfile(candidate: string, profile: Profile, heldoutSamples: string[], channel?: ProfileChannel): ProfileScoreReportV1 {
  const selectedChannel = profile.version === '3' ? profile.channel ?? 'general' : 'general';
  if (channel && channel !== selectedChannel) return { version: '1', disposition: 'abstain', channel: selectedChannel, reason: 'The requested channel does not match the selected profile.' };
  if (heldoutSamples.length < 3) return { version: '1', disposition: 'abstain', channel: selectedChannel, reason: 'Held-out scoring needs at least three distinct samples.' };
  if (![candidate, ...heldoutSamples].every(languageConfidence)) return { version: '1', disposition: 'abstain', channel: selectedChannel, reason: 'Language confidence is too low for the current English-oriented metric set.' };
  const heldout = heldoutSamples.map(profileMetrics);
  const pairScores: number[] = [];
  for (let left = 0; left < heldout.length; left += 1) for (let right = left + 1; right < heldout.length; right += 1) pairScores.push(score(componentScores(heldout[left]!, heldout[right]!)));
  pairScores.sort((left, right) => left - right);
  const components = componentScores(profileMetrics(candidate), profile.metrics);
  const candidateScore = score(components);
  const lowerBound = rounded(sortedPercentile(pairScores, 0.1));
  const median = rounded(sortedPercentile(pairScores, 0.5));
  return {
    version: '1',
    disposition: candidateScore >= lowerBound ? 'inside_band' : 'review',
    channel: selectedChannel,
    candidateScore,
    selfSimilarity: { samplePairs: pairScores.length, ceiling: 100, lowerBound, median },
    components: Object.fromEntries(METRICS.map((key) => [key, rounded(components[key] * 100)])) as Record<MetricName, number>,
  };
}

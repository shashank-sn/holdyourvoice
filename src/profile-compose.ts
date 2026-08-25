import { createHash } from 'node:crypto';
import type { FounderFingerprint, ProfileChannel, ProfileV3, RulePolicyState, ToneVector, VoiceDnaMetrics } from './contracts.js';
import { canonicalJson } from './canonical-json.js';

function weighted(values: number[], weights: number[]): number {
  return Number((values.reduce((sum, value, index) => sum + value * weights[index]!, 0) / weights.reduce((sum, value) => sum + value, 0)).toFixed(3));
}
function weightedList(lists: string[][], weights: number[], limit: number): string[] {
  const scores = new Map<string, number>();
  for (let index = 0; index < lists.length; index += 1) for (const item of lists[index]!) scores.set(item, (scores.get(item) ?? 0) + weights[index]!);
  return [...scores].sort(([leftKey, leftScore], [rightKey, rightScore]) => rightScore - leftScore || leftKey.localeCompare(rightKey)).slice(0, limit).map(([item]) => item);
}
function categorical<T extends string>(values: T[], weights: number[]): T {
  const scores = new Map<T, number>();
  for (let index = 0; index < values.length; index += 1) scores.set(values[index]!, (scores.get(values[index]!) ?? 0) + weights[index]!);
  return [...scores].sort(([leftKey, leftScore], [rightKey, rightScore]) => rightScore - leftScore || leftKey.localeCompare(rightKey))[0]![0];
}
function strictest(states: RulePolicyState[]): RulePolicyState {
  const rank: Record<RulePolicyState, number> = { disabled: 0, advisory: 1, 'judgment-required': 2, blocking: 3 };
  return [...states].sort((left, right) => rank[right] - rank[left])[0]!;
}
function metrics(profiles: ProfileV3[], weights: number[]): VoiceDnaMetrics {
  const source = profiles.map((profile) => profile.metrics);
  const numeric = (key: 'sentenceLength' | 'sentenceVariation' | 'rhythm' | 'paragraphLength' | 'lexicalDensity' | 'questionRate') => weighted(source.map((item) => item[key]), weights);
  const punctuation = Object.fromEntries(['!', '?', ';', ':', '—'].map((key) => [key, weighted(source.map((item) => item.punctuation[key] ?? 0), weights)]));
  return {
    sentenceLength: numeric('sentenceLength'), sentenceVariation: numeric('sentenceVariation'), rhythm: numeric('rhythm'), paragraphLength: numeric('paragraphLength'),
    lexicalDensity: numeric('lexicalDensity'), questionRate: numeric('questionRate'), punctuation,
    sentenceStructure: weightedList(source.map((item) => item.sentenceStructure), weights, 8),
    openingMoves: weightedList(source.map((item) => item.openingMoves), weights, 8),
    vocabulary: weightedList(source.map((item) => item.vocabulary), weights, 20),
    transitions: weightedList(source.map((item) => item.transitions), weights, 8),
    pointOfView: categorical(source.map((item) => item.pointOfView), weights),
    caseStyle: categorical(source.map((item) => item.caseStyle), weights),
  };
}
function fingerprint(profiles: ProfileV3[], weights: number[]): FounderFingerprint {
  return {
    contractionRate: weighted(profiles.map((profile) => profile.fingerprint.contractionRate), weights),
    sentenceLengthDistribution: {
      short: weighted(profiles.map((profile) => profile.fingerprint.sentenceLengthDistribution.short), weights),
      medium: weighted(profiles.map((profile) => profile.fingerprint.sentenceLengthDistribution.medium), weights),
      long: weighted(profiles.map((profile) => profile.fingerprint.sentenceLengthDistribution.long), weights),
    },
    bulletRate: weighted(profiles.map((profile) => profile.fingerprint.bulletRate), weights),
    enDashRate: weighted(profiles.map((profile) => profile.fingerprint.enDashRate), weights),
  };
}
function tone(profiles: ProfileV3[], weights: number[]): ToneVector | undefined {
  if (profiles.some((profile) => !profile.tone)) return undefined;
  return {
    formality: weighted(profiles.map((profile) => profile.tone!.formality), weights),
    confidence: weighted(profiles.map((profile) => profile.tone!.confidence), weights),
    warmth: weighted(profiles.map((profile) => profile.tone!.warmth), weights),
    energy: weighted(profiles.map((profile) => profile.tone!.energy), weights),
    complexity: weighted(profiles.map((profile) => profile.tone!.complexity), weights),
  };
}

export function parseProfileRatio(value: string, count: number): number[] {
  const values = value.split(':').map((part) => Number(part));
  if (values.length !== count || values.some((item) => !Number.isFinite(item) || item <= 0)) throw new Error('Profile ratio must contain ' + count + ' positive colon-separated values.');
  return values;
}

/** Composes local Profile v3 mechanics. Policies intersect conservatively. */
export function composeProfiles(profiles: ProfileV3[], ratio: number[]): ProfileV3 {
  if (profiles.length < 2 || ratio.length !== profiles.length) throw new Error('Compose at least two Profile v3 inputs with one ratio value each.');
  const channel = categorical(profiles.map((profile) => profile.channel ?? 'general'), ratio) as ProfileChannel;
  const policyIds = new Set(profiles.flatMap((profile) => Object.keys(profile.rulePolicy)));
  const rulePolicy = Object.fromEntries([...policyIds].map((id) => [id, strictest(profiles.map((profile) => profile.rulePolicy[id] ?? 'disabled'))]));
  const fixtures = (key: keyof ProfileV3['metricFixtures']) => [...new Set(profiles.flatMap((profile) => profile.metricFixtures[key]))].sort().slice(0, 64);
  const composedTone = tone(profiles, ratio);
  const unsigned = {
    version: '3' as const,
    id: 'composed.' + createHash('sha256').update(canonicalJson({ profiles: profiles.map((profile) => [profile.id, profile.revision, profile.revisionDigest]), ratio })).digest('hex').slice(0, 24),
    revision: 1,
    sampleCount: profiles.reduce((sum, profile) => sum + profile.sampleCount, 0),
    metrics: metrics(profiles, ratio),
    avoid: [...new Set(profiles.flatMap((profile) => profile.avoid))],
    provenance: { source: 'local-profile-composition', rights: 'derived-from-author-owned-profiles', createdAt: [...profiles].map((profile) => profile.provenance.createdAt).sort().at(-1)! },
    rulePolicy,
    channel,
    ...(composedTone ? { tone: composedTone } : {}),
    fingerprint: fingerprint(profiles, ratio),
    tolerances: {
      contractionRate: { absolute: Math.min(...profiles.map((profile) => profile.tolerances.contractionRate.absolute)), calibrated: profiles.every((profile) => profile.tolerances.contractionRate.calibrated) },
      sentenceLengthDistribution: { absolute: Math.min(...profiles.map((profile) => profile.tolerances.sentenceLengthDistribution.absolute)), calibrated: profiles.every((profile) => profile.tolerances.sentenceLengthDistribution.calibrated) },
      bulletRate: { absolute: Math.min(...profiles.map((profile) => profile.tolerances.bulletRate.absolute)), calibrated: profiles.every((profile) => profile.tolerances.bulletRate.calibrated) },
      enDashRate: { absolute: Math.min(...profiles.map((profile) => profile.tolerances.enDashRate.absolute)), calibrated: profiles.every((profile) => profile.tolerances.enDashRate.calibrated) },
    },
    metricFixtures: { contractionRate: fixtures('contractionRate'), sentenceLengthDistribution: fixtures('sentenceLengthDistribution'), bulletRate: fixtures('bulletRate'), enDashRate: fixtures('enDashRate') },
  };
  return { ...unsigned, revisionDigest: createHash('sha256').update(canonicalJson(unsigned)).digest('hex') };
}

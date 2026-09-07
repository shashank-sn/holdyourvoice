import { createHash } from 'node:crypto';
import type { FingerprintMetric, Profile, ProfileChannel, ProfileV2, ProfileV3, RuleAllowance, ToneVector, VoiceDnaMetrics } from './contracts.js';
import { canonicalJson } from './canonical-json.js';
import { isPlainObject } from './internal.js';

const METRICS_KEYS = ['sentenceLength', 'sentenceVariation', 'sentenceStructure', 'rhythm', 'paragraphLength', 'openingMoves', 'vocabulary', 'lexicalDensity', 'pointOfView', 'punctuation', 'caseStyle', 'questionRate', 'transitions'] as const;
const PROFILE_V3_REQUIRED_KEYS = ['version', 'id', 'revision', 'revisionDigest', 'sampleCount', 'metrics', 'avoid', 'provenance', 'rulePolicy', 'fingerprint', 'tolerances', 'metricFixtures'] as const;
const PROFILE_V3_ALLOWED_KEYS = [...PROFILE_V3_REQUIRED_KEYS, 'ruleAllowances', 'channel', 'tone'] as const;
const FINGERPRINT_METRICS: FingerprintMetric[] = ['contractionRate', 'sentenceLengthDistribution', 'bulletRate', 'enDashRate'];
const STABLE_ID = /^[a-z0-9](?:[a-z0-9._-]{0,127})$/;
export const SAMPLE_ALLOWANCE_RULE_IDS = new Set(['punct.em-dash', 'punct.en-dash', 'format.curly-quotes']);

function hasKnownKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

function isBoundedString(value: unknown, maximum = 256): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function isRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isBoundedStringArray(value: unknown, minimum = 0): value is string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= 64
    && value.every((item) => isBoundedString(item)) && new Set(value).size === value.length;
}

function isPunctuation(value: unknown): value is Record<string, number> {
  const marks = ['!', '?', ';', ':', '—'];
  return isPlainObject(value)
    && Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0)
    && Object.keys(value).length === marks.length && hasKnownKeys(value, marks);
}

function isMetrics(value: unknown): value is VoiceDnaMetrics {
  if (!value || typeof value !== 'object') return false;
  const metrics = value as Partial<VoiceDnaMetrics>;
  const numbers = [metrics.sentenceLength, metrics.sentenceVariation, metrics.rhythm, metrics.paragraphLength, metrics.lexicalDensity, metrics.questionRate];
  const stringArrays = [metrics.sentenceStructure, metrics.openingMoves, metrics.vocabulary, metrics.transitions];
  return numbers.every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0)
    && typeof metrics.lexicalDensity === 'number' && metrics.lexicalDensity <= 1
    && typeof metrics.questionRate === 'number' && metrics.questionRate <= 1
    && ['first_person', 'second_person', 'third_person', 'mixed'].includes(metrics.pointOfView ?? '')
    && ['lowercase', 'standard', 'mixed'].includes(metrics.caseStyle ?? '')
    && stringArrays.every((items) => Array.isArray(items) && items.every((item) => typeof item === 'string'))
    && isPunctuation(metrics.punctuation);
}

function isStrictMetrics(value: unknown): value is VoiceDnaMetrics {
  return isPlainObject(value) && hasKnownKeys(value, METRICS_KEYS) && isMetrics(value)
    && [value.sentenceStructure, value.openingMoves, value.vocabulary, value.transitions].every((items) => isBoundedStringArray(items));
}

function isProvenance(value: unknown): boolean {
  if (!isPlainObject(value) || !hasKnownKeys(value, ['source', 'rights', 'createdAt'])) return false;
  if (!isBoundedString(value.source) || !isBoundedString(value.rights) || !isBoundedString(value.createdAt, 64)) return false;
  const parsed = new Date(value.createdAt);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value.createdAt;
}

function isRulePolicy(value: unknown): boolean {
  if (!isPlainObject(value) || Object.keys(value).length > 512) return false;
  const states = ['blocking', 'advisory', 'judgment-required', 'disabled'];
  return Object.entries(value).every(([id, state]) => STABLE_ID.test(id) && states.includes(state as string));
}

function isRuleAllowances(value: unknown, profileSampleCount: unknown): value is Record<string, RuleAllowance> {
  if (!isPlainObject(value) || Object.keys(value).length > SAMPLE_ALLOWANCE_RULE_IDS.size || typeof profileSampleCount !== 'number') return false;
  return Object.entries(value).every(([id, allowance]) => {
    if (!SAMPLE_ALLOWANCE_RULE_IDS.has(id) || !isPlainObject(allowance)) return false;
    const candidate = allowance as Record<string, unknown>;
    return typeof candidate.sampleCount === 'number' && Number.isInteger(candidate.sampleCount) && candidate.sampleCount >= 2 && candidate.sampleCount <= profileSampleCount
      && typeof candidate.evidenceDigest === 'string' && /^[a-f0-9]{64}$/.test(candidate.evidenceDigest);
  });
}

function isProfileChannel(value: unknown): value is ProfileChannel {
  return ['general', 'email', 'chat', 'long-form', 'social', 'docs'].includes(value as string);
}

function isTone(value: unknown): value is ToneVector {
  return isPlainObject(value) && hasKnownKeys(value, ['formality', 'confidence', 'warmth', 'energy', 'complexity'])
    && Object.values(value).every(isRate);
}

function isFingerprint(value: unknown): boolean {
  if (!isPlainObject(value) || !hasKnownKeys(value, FINGERPRINT_METRICS)) return false;
  const distribution = value.sentenceLengthDistribution;
  if (!isPlainObject(distribution) || !hasKnownKeys(distribution, ['short', 'medium', 'long'])) return false;
  const parts = [distribution.short, distribution.medium, distribution.long];
  return isRate(value.contractionRate) && isRate(value.bulletRate) && isRate(value.enDashRate)
    && parts.every(isRate) && Math.abs(parts.reduce((sum, item) => sum + item, 0) - 1) < 1e-9;
}

function isTolerances(value: unknown): boolean {
  return isPlainObject(value) && hasKnownKeys(value, FINGERPRINT_METRICS) && FINGERPRINT_METRICS.every((key) => {
    const tolerance = value[key];
    return isPlainObject(tolerance) && hasKnownKeys(tolerance, ['absolute', 'calibrated'])
      && isRate(tolerance.absolute) && typeof tolerance.calibrated === 'boolean';
  });
}

function isMetricFixtures(value: unknown): boolean {
  return isPlainObject(value) && hasKnownKeys(value, FINGERPRINT_METRICS)
    && FINGERPRINT_METRICS.every((key) => isBoundedStringArray(value[key], 1) && (value[key] as string[]).every((id) => STABLE_ID.test(id)));
}

function hasValidRevisionDigest(profile: Record<string, unknown>): boolean {
  if (typeof profile.revisionDigest !== 'string' || !/^[a-f0-9]{64}$/.test(profile.revisionDigest)) return false;
  const { revisionDigest, ...unsigned } = profile;
  return createHash('sha256').update(canonicalJson(unsigned)).digest('hex') === revisionDigest;
}

function parseProfileV3(value: Record<string, unknown>): ProfileV3 {
  const invalid = () => { throw new Error('Profile is not a valid Hold Your Voice version 3 profile. Rebuild it from fixture-backed metrics.'); };
  if (!isPlainObject(value)
    || !Object.keys(value).every((key) => PROFILE_V3_ALLOWED_KEYS.includes(key as typeof PROFILE_V3_ALLOWED_KEYS[number]))
    || !PROFILE_V3_REQUIRED_KEYS.every((key) => key in value)) invalid();

  if (typeof value.id !== 'string' || !STABLE_ID.test(value.id)
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision <= 0
    || typeof value.sampleCount !== 'number' || !Number.isInteger(value.sampleCount) || value.sampleCount < 2) invalid();

  if (!isStrictMetrics(value.metrics) || !isBoundedStringArray(value.avoid)
    || !isProvenance(value.provenance) || !isRulePolicy(value.rulePolicy)
    || !isFingerprint(value.fingerprint) || !isTolerances(value.tolerances)
    || !isMetricFixtures(value.metricFixtures)) invalid();

  if (value.ruleAllowances !== undefined && !isRuleAllowances(value.ruleAllowances, value.sampleCount)) {
    throw new Error('Profile version 3 rule allowances must be derived from at least two samples and use eligible rule IDs.');
  }
  if (value.ruleAllowances && Object.keys(value.ruleAllowances).some((id) => (value.rulePolicy as Record<string, unknown>)[id] === 'blocking')) {
    throw new Error('Profile version 3 rule allowances cannot weaken an explicit blocking policy.');
  }
  if (value.channel !== undefined && !isProfileChannel(value.channel)) throw new Error('Profile version 3 channel must be one of the supported local writing channels.');
  if (value.tone !== undefined && !isTone(value.tone)) throw new Error('Profile version 3 tone must contain five 0–1 advisory dimensions.');
  if (!hasValidRevisionDigest(value)) throw new Error('Profile version 3 revision digest does not match its canonical contents.');
  return value as unknown as ProfileV3;
}

export function parseProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object') throw new Error('Profile must be a JSON object.');
  const profile = value as Record<string, unknown>;
  if (profile.version === '3') return parseProfileV3(profile);
  if (profile.version !== '2' || typeof profile.sampleCount !== 'number' || !Number.isInteger(profile.sampleCount) || profile.sampleCount < 2 || !isMetrics(profile.metrics) || !Array.isArray(profile.avoid) || !profile.avoid.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    throw new Error('Profile is not a valid Hold Your Voice version 2 profile. Rebuild it with the profile command.');
  }
  return profile as unknown as ProfileV2;
}

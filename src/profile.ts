import type { Profile, VoiceDnaMetrics } from './contracts.js';

function isNumberRecord(value: unknown): value is Record<string, number> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
    && Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item));
}

function isPunctuation(value: unknown): value is Record<string, number> {
  const marks = ['!', '?', ';', ':', '—'];
  return isNumberRecord(value) && Object.values(value).every((item) => item >= 0) && Object.keys(value).length === marks.length && marks.every((mark) => mark in value);
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

export function parseProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object') throw new Error('Profile must be a JSON object.');
  const profile = value as Partial<Profile>;
  if (profile.version !== '2' || typeof profile.sampleCount !== 'number' || !Number.isInteger(profile.sampleCount) || profile.sampleCount < 2 || !isMetrics(profile.metrics) || !Array.isArray(profile.avoid) || !profile.avoid.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    throw new Error('Profile is not a valid Hold Your Voice version 2 profile. Rebuild it with the profile command.');
  }
  return profile as Profile;
}

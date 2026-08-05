import { rules, RULESET_VERSION } from './ai-editor.js';
import { composeLearning, type LearningOptions, recordVerifiedCandidate } from './learning.js';
import { analyze, rewritePrompt, verify } from './pipeline.js';
import { parseProfile } from './profile.js';
import { buildProfile } from './voice-dna.js';

function profileFromJson(profileJson: string) {
  try {
    return parseProfile(JSON.parse(profileJson));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Profile is not valid JSON.');
  }
}

export function buildProfileForMcp(samples: string[], avoid: string[] = []) {
  return buildProfile(samples, avoid);
}

export function analyzeForMcp(draft: string, profileJson: string) {
  return analyze(draft, profileFromJson(profileJson));
}

export function rewritePromptForMcp(draft: string, profileJson: string, options: LearningOptions = {}) {
  const profile = profileFromJson(profileJson);
  return { prompt: rewritePrompt(draft, profile, composeLearning(profile, options)) };
}

export function verifyForMcp(original: string, candidate: string, profileJson: string, options: LearningOptions = {}) {
  const profile = profileFromJson(profileJson);
  const result = verify(original, candidate, profile);
  return { ...result, learning: recordVerifiedCandidate(profile, result, candidate, options) };
}

export function patternsForMcp() {
  return { version: RULESET_VERSION, rules: rules.map(({ expression, ...rule }) => ({ ...rule, expression: expression.source })) };
}

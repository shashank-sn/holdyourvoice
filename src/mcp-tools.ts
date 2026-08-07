import { rules, RULESET_VERSION } from './ai-editor.js';
import { parseCopySpec } from './copy-spec.js';
import { composeLearning, type LearningOptions, recordVerifiedCandidate } from './learning.js';
import { analyze, rewritePrompt, verify, verifyWithCopySpec } from './pipeline.js';
import { parseProfile } from './profile.js';
import { evaluateRewriteResponse, parseRewriteTask, prepareRewriteTask } from './rewrite-task.js';
import { buildProfile } from './voice-dna.js';

function profileFromJson(profileJson: string) {
  try {
    return parseProfile(JSON.parse(profileJson));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Profile is not valid JSON.');
  }
}

function copySpecFromJson(copySpecJson: string) {
  try {
    return parseCopySpec(JSON.parse(copySpecJson));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'CopySpec is not valid JSON.');
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

export function prepareRewriteForMcp(draft: string, profileJson: string, copySpecJson?: string) {
  return prepareRewriteTask(draft, profileFromJson(profileJson), copySpecJson ? copySpecFromJson(copySpecJson) : undefined);
}

export function applyRewriteForMcp(taskJson: string, responseJson: string, profileJson: string) {
  return evaluateRewriteResponse(parseRewriteTask(JSON.parse(taskJson)), responseJson, profileFromJson(profileJson));
}

export function verifyForMcp(original: string, candidate: string, profileJson: string, options: LearningOptions = {}) {
  const profile = profileFromJson(profileJson);
  const result = verify(original, candidate, profile);
  return { ...result, learning: recordVerifiedCandidate(profile, result, candidate, options) };
}

export function verifyCopySpecForMcp(original: string, candidate: string, profileJson: string, copySpecJson: string, options: LearningOptions = {}) {
  const profile = profileFromJson(profileJson);
  const result = verifyWithCopySpec(original, candidate, profile, copySpecFromJson(copySpecJson));
  return { ...result, learning: result.passed ? recordVerifiedCandidate(profile, result, candidate, options) : 'nothing_to_learn' };
}

export function patternsForMcp() {
  return { version: RULESET_VERSION, rules: rules.map(({ expression, ...rule }) => ({ ...rule, expression: expression.source })) };
}

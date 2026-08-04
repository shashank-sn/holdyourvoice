#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { rules, RULESET_VERSION } from './ai-editor.js';
import type { Profile, VoiceDnaMetrics } from './contracts.js';
import { analyze, rewritePrompt, verify } from './pipeline.js';
import { buildProfile } from './voice-dna.js';

const usage = 'Commands: profile, analyze, rewrite-prompt, verify, patterns';

function input(path: string): string {
  return path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item));
}

function isPunctuation(value: unknown): value is Record<string, number> {
  const marks = ['!', '?', ';', ':', '—'];
  return isNumberRecord(value) && Object.keys(value).length === marks.length && marks.every((mark) => mark in value);
}

function isMetrics(value: unknown): value is VoiceDnaMetrics {
  if (!value || typeof value !== 'object') return false;
  const metrics = value as Partial<VoiceDnaMetrics>;
  const numbers = [metrics.sentenceLength, metrics.sentenceVariation, metrics.rhythm, metrics.paragraphLength, metrics.lexicalDensity, metrics.questionRate];
  const stringArrays = [metrics.sentenceStructure, metrics.openingMoves, metrics.vocabulary, metrics.transitions];
  return numbers.every((item) => typeof item === 'number' && Number.isFinite(item))
    && ['first_person', 'second_person', 'third_person', 'mixed'].includes(metrics.pointOfView ?? '')
    && ['lowercase', 'standard', 'mixed'].includes(metrics.caseStyle ?? '')
    && stringArrays.every((items) => Array.isArray(items) && items.every((item) => typeof item === 'string'))
    && isPunctuation(metrics.punctuation);
}

function readProfile(path: string): Profile {
  const value: unknown = JSON.parse(input(path));
  if (!value || typeof value !== 'object') throw new Error('Profile must be a JSON object.');
  const profile = value as Partial<Profile>;
  if (profile.version !== '2' || typeof profile.sampleCount !== 'number' || profile.sampleCount < 2 || !isMetrics(profile.metrics) || !Array.isArray(profile.avoid) || !profile.avoid.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    throw new Error('Profile is not a valid Hold Your Voice version 2 profile. Rebuild it with the profile command.');
  }
  return profile as Profile;
}

function json(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function profileArguments(args: string[]): { output: string; samples: string[]; avoid: string[] } {
  const [output, ...rest] = args;
  const samples: string[] = [];
  const avoid: string[] = [];
  for (const argument of rest) {
    if (argument.startsWith('--avoid=')) {
      const phrase = argument.slice('--avoid='.length).trim();
      if (!phrase) throw new Error('Avoid phrases must use --avoid=phrase.');
      avoid.push(phrase);
    } else {
      samples.push(argument);
    }
  }
  if (!output || samples.length < 2) throw new Error('Usage: holdyourvoice profile profile.json sample-a.md sample-b.md [sample-c.md] [--avoid=phrase]');
  return { output, samples, avoid };
}

export function runCli(args: string[]): number {
  const [command, ...rest] = args;
  if (command === 'profile') {
    const { output, samples, avoid } = profileArguments(rest);
    writeFileSync(output, `${JSON.stringify(buildProfile(samples.map(input), avoid), null, 2)}\n`);
    return 0;
  }
  if (command === 'analyze') {
    const [draft, profilePath] = rest;
    if (!draft || !profilePath) throw new Error('Usage: holdyourvoice analyze draft.md profile.json');
    json(analyze(input(draft), readProfile(profilePath)));
    return 0;
  }
  if (command === 'rewrite-prompt') {
    const [draft, profilePath] = rest;
    if (!draft || !profilePath) throw new Error('Usage: holdyourvoice rewrite-prompt draft.md profile.json');
    console.log(rewritePrompt(input(draft), readProfile(profilePath)));
    return 0;
  }
  if (command === 'verify') {
    const [original, candidate, profilePath] = rest;
    if (!original || !candidate || !profilePath) throw new Error('Usage: holdyourvoice verify original.md candidate.md profile.json');
    const result = verify(input(original), input(candidate), readProfile(profilePath));
    json(result);
    return result.passed ? 0 : 2;
  }
  if (command === 'patterns') {
    json({ version: RULESET_VERSION, rules: rules.map(({ expression, ...rule }) => ({ ...rule, expression: expression.source })) });
    return 0;
  }
  throw new Error(`${usage}.`);
}

try {
  process.exitCode = runCli(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { rules, RULESET_VERSION } from './ai-editor.js';
import { parseCopySpec } from './copy-spec.js';
import type { Profile } from './contracts.js';
import { addLearningInstruction, clearLearning, composeLearning, profileFingerprint, recordVerifiedCandidate } from './learning.js';
import { analyze, rewritePrompt, verify, verifyWithCopySpec } from './pipeline.js';
import { parseProfile } from './profile.js';
import { buildProfile } from './voice-dna.js';

const usage = 'Commands: profile, analyze, rewrite-prompt, verify, verify-spec, learning, patterns, mcp';

function input(path: string): string {
  return path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
}

function readProfile(path: string): Profile {
  return parseProfile(JSON.parse(input(path)));
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
  if (!output || samples.length < 2) throw new Error('Usage: hyv profile profile.json sample-a.md sample-b.md [sample-c.md] [--avoid=phrase]');
  return { output, samples, avoid };
}

export async function runCli(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (command === 'profile') {
    const { output, samples, avoid } = profileArguments(rest);
    writeFileSync(output, `${JSON.stringify(buildProfile(samples.map(input), avoid), null, 2)}\n`);
    return 0;
  }
  if (command === 'analyze') {
    const [draft, profilePath] = rest;
    if (!draft || !profilePath) throw new Error('Usage: hyv analyze draft.md profile.json');
    json(analyze(input(draft), readProfile(profilePath)));
    return 0;
  }
  if (command === 'rewrite-prompt') {
    const [draft, profilePath] = rest;
    if (!draft || !profilePath) throw new Error('Usage: hyv rewrite-prompt draft.md profile.json');
    const profile = readProfile(profilePath);
    console.log(rewritePrompt(input(draft), profile, composeLearning(profile)));
    return 0;
  }
  if (command === 'verify') {
    const [original, candidate, profilePath] = rest;
    if (!original || !candidate || !profilePath) throw new Error('Usage: hyv verify original.md candidate.md profile.json');
    const profile = readProfile(profilePath);
    const originalText = input(original);
    const candidateText = input(candidate);
    const result = verify(originalText, candidateText, profile);
    const learning = recordVerifiedCandidate(profile, result, candidateText);
    if (learning === 'write_failed') console.error('Warning: verification passed, but local learning could not be saved.');
    json(result);
    return result.passed ? 0 : 2;
  }
  if (command === 'verify-spec') {
    const [original, candidate, profilePath, specPath] = rest;
    if (!original || !candidate || !profilePath || !specPath) throw new Error('Usage: hyv verify-spec original.md candidate.md profile.json copy-spec.json');
    const profile = readProfile(profilePath);
    const candidateText = input(candidate);
    const result = verifyWithCopySpec(input(original), candidateText, profile, parseCopySpec(JSON.parse(input(specPath))));
    if (result.passed) {
      const learning = recordVerifiedCandidate(profile, result, candidateText);
      if (learning === 'write_failed') console.error('Warning: verification passed, but local learning could not be saved.');
    }
    json(result);
    return result.passed ? 0 : 2;
  }
  if (command === 'learning') {
    const [action, profilePath, ...instruction] = rest;
    if (!action || !profilePath) throw new Error('Usage: hyv learning <show|add|clear> profile.json [instruction]');
    const profile = readProfile(profilePath);
    if (action === 'show') {
      json({ profile: profileFingerprint(profile), preferences: composeLearning(profile) });
      return 0;
    }
    if (action === 'add') {
      const text = instruction.join(' ').trim();
      if (!text) throw new Error('Usage: hyv learning add profile.json "instruction"');
      json({ added: addLearningInstruction(profile, text) });
      return 0;
    }
    if (action === 'clear') {
      json({ cleared: clearLearning(profile) });
      return 0;
    }
    throw new Error('Usage: hyv learning <show|add|clear> profile.json [instruction]');
  }
  if (command === 'patterns') {
    json({ version: RULESET_VERSION, rules: rules.map(({ expression, ...rule }) => ({ ...rule, expression: expression.source })) });
    return 0;
  }
  if (command === 'mcp') {
    if (rest.length > 0) throw new Error('Usage: hyv mcp');
    await import('./mcp.js');
    return 0;
  }
  throw new Error(`${usage}.`);
}

void (async () => {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
})();

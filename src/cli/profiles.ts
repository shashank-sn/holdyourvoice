import { lstatSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { ProfileChannel, ProfileV3 } from '../contracts.js';
import { buildProfile, buildProfileV3 } from '../voice-dna.js';
import { assessProfileReadiness } from '../profile-quality.js';
import { composeTeamProfile, parseTeamProfileBundle } from '../team-profile.js';
import { composeProfiles, parseProfileRatio } from '../profile-compose.js';
import { scoreHeldoutProfile } from '../profile-score.js';
import { ingestGmailSentMbox, ingestTelegramDesktopJson } from '../sample-ingest.js';
import { evaluateIsolatedBacktest } from '../backtest.js';
import { watchProfileSamples } from '../profile-watch.js';
import { evaluateLocalComposite, type EvalParagraph } from '../local-eval.js';
import { input, readJson, readProfile, json, writeJson } from './io.js';

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

async function runProfileWatch(args: string[]): Promise<number> {
  const [output, ...rest] = args;
  const samples: string[] = []; let id = ''; let channel: ProfileChannel | undefined; let debounceMs = 500;
  for (const value of rest) {
    if (value.startsWith('--id=')) id = value.slice('--id='.length);
    else if (value.startsWith('--channel=')) channel = value.slice('--channel='.length) as ProfileChannel;
    else if (value.startsWith('--debounce-ms=')) debounceMs = Number(value.slice('--debounce-ms='.length));
    else samples.push(value);
  }
  if (!output || !isAbsolute(output) || !id || !channel || samples.length < 2) throw new Error('Usage: hyv profile watch /absolute/profile.json --id=writer.channel --channel=email sample-a.md sample-b.md [--debounce-ms=500]');
  outputOutsideGitCheckout(dirname(output));
  let initial = true;
  const rebuild = () => {
    const profile = buildProfileV3(samples.map(input), id, channel!);
    writeFileSync(output, JSON.stringify(profile, null, 2) + '\n', { encoding: 'utf8', flag: initial ? 'wx' : 'w', mode: 0o600 });
    initial = false;
    json({ version: '1', status: 'rebuilt', sampleCount: samples.length, profileId: profile.id, revisionDigest: profile.revisionDigest });
  };
  rebuild();
  const handle = watchProfileSamples({ samples, debounceMs, rebuild });
  await new Promise<void>((resolve) => process.once('SIGINT', resolve));
  handle.close();
  return 0;
}

export function runProfile(args: string[]): number | Promise<number> {
  if (args[0] === 'watch') return runProfileWatch(args.slice(1));
  if (args[0] === 'assess') {
    if (args.length < 3) throw new Error('Usage: hyv profile assess sample-a.md sample-b.md [sample-c.md]');
    json(assessProfileReadiness(args.slice(1).map(input)));
    return 0;
  }
  if (args[0] === 'compose') {
    const rest = args.slice(1);
    const ratioIndex = rest.findIndex((value) => value === '--ratio' || value.startsWith('--ratio='));
    if (ratioIndex < 0) throw new Error('Usage: hyv profile compose --ratio 70:30 profile-a.json profile-b.json [profile-c.json]');
    const ratio = rest[ratioIndex] === '--ratio' ? rest[ratioIndex + 1] : rest[ratioIndex]!.slice('--ratio='.length);
    const profilePaths = rest.filter((_, index) => index !== ratioIndex && index !== ratioIndex + Number(rest[ratioIndex] === '--ratio'));
    if (!ratio || profilePaths.length < 2) throw new Error('Usage: hyv profile compose --ratio 70:30 profile-a.json profile-b.json [profile-c.json]');
    const profiles = profilePaths.map(readProfile);
    if (profiles.some((profile) => profile.version !== '3')) throw new Error('Profile composition requires Profile v3 inputs.');
    json(composeProfiles(profiles as ProfileV3[], parseProfileRatio(ratio, profiles.length)));
    return 0;
  }
  if (args[0] === 'v3') {
    const [output, ...rest] = args.slice(1);
    const samples: string[] = []; const avoid: string[] = [];
    let id = ''; let channel: ProfileChannel | undefined; let tone: ProfileV3['tone'];
    for (const argument of rest) {
      if (argument.startsWith('--id=')) id = argument.slice('--id='.length);
      else if (argument.startsWith('--channel=')) channel = argument.slice('--channel='.length) as ProfileChannel;
      else if (argument.startsWith('--avoid=')) avoid.push(argument.slice('--avoid='.length));
      else if (argument.startsWith('--tone=')) {
        const values = argument.slice('--tone='.length).split(',').map(Number);
        if (values.length !== 5 || values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Tone must use five 0–1 comma-separated values: formality,confidence,warmth,energy,complexity.');
        tone = { formality: values[0]!, confidence: values[1]!, warmth: values[2]!, energy: values[3]!, complexity: values[4]! };
      } else samples.push(argument);
    }
    if (!output || !id || !channel || samples.length < 2) throw new Error('Usage: hyv profile v3 profile.json --id=writer.channel --channel=email sample-a.md sample-b.md [--tone=0,0,0,0,0] [--avoid=phrase]');
    writeJson(output, buildProfileV3(samples.map(input), id, channel, avoid, tone));
    return 0;
  }
  const { output, samples, avoid } = profileArguments(args);
  writeJson(output, buildProfile(samples.map(input), avoid));
  return 0;
}

export function runScore(args: string[]): number {
  const [draftPath, profilePath, ...rest] = args;
  if (!draftPath || !profilePath) throw new Error('Usage: hyv score draft.md profile.json heldout-a.md heldout-b.md heldout-c.md [--channel=channel]');
  const samplePaths: string[] = [];
  let channel: ProfileChannel | undefined;
  for (const value of rest) {
    if (value.startsWith('--channel=')) channel = value.slice('--channel='.length) as ProfileChannel;
    else samplePaths.push(value);
  }
  if (samplePaths.length < 3) throw new Error('Usage: hyv score draft.md profile.json heldout-a.md heldout-b.md heldout-c.md [--channel=channel]');
  json(scoreHeldoutProfile(input(draftPath), readProfile(profilePath), samplePaths.map(input), channel));
  return 0;
}

export function runBacktest(args: string[]): number {
  const [contextPath, targetPath, candidatePath, profilePath, ...heldoutPaths] = args;
  if (!contextPath || !targetPath || !candidatePath || !profilePath || heldoutPaths.length < 3) throw new Error('Usage: hyv backtest context.md heldout-target.md candidate.md profile.json heldout-a.md heldout-b.md heldout-c.md');
  json(evaluateIsolatedBacktest(input(contextPath), input(targetPath), input(candidatePath), readProfile(profilePath), heldoutPaths.map(input)));
  return 0;
}

function readEvalParagraphs(path: string, label: string): EvalParagraph[] {
  const value = readJson(path);
  if (!Array.isArray(value) || !value.every((item) => item && typeof item === 'object' && typeof (item as { paragraph_id?: unknown }).paragraph_id === 'string' && typeof (item as { text?: unknown }).text === 'string')) throw new Error(`${label} must be a JSON array of { paragraph_id, text } values.`);
  return value.map((item) => ({ paragraphId: (item as { paragraph_id: string }).paragraph_id, text: (item as { text: string }).text }));
}

export function runEvaluateLocal(args: string[]): number {
  const [inputPath, candidatePath, userPath, aiShadowPath] = args;
  if (!inputPath || !candidatePath || !userPath || !aiShadowPath || args.length !== 4) throw new Error('Usage: hyv evaluate-local input.md candidate.md user-paragraphs.json ai-shadow-paragraphs.json');
  json(evaluateLocalComposite(input(inputPath), input(candidatePath), readEvalParagraphs(userPath, 'User paragraphs'), readEvalParagraphs(aiShadowPath, 'AI-shadow paragraphs')));
  return 0;
}

function outputOutsideGitCheckout(path: string): void {
  if (!isAbsolute(path)) throw new Error('Sample ingest output must be an absolute path outside a Git checkout.');
  let current: string;
  try {
    const stats = lstatSync(path);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Sample ingest output directory must be an existing non-symlink directory outside a Git checkout.');
    current = realpathSync(path);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Sample ingest output directory')) throw error;
    throw new Error('Sample ingest output directory must already exist and remain outside a Git checkout.');
  }
  for (;;) {
    try {
      lstatSync(join(current, '.git'));
      throw new Error('Sample ingest output must be outside a Git checkout.');
    } catch (error) {
      if (error instanceof Error && error.message === 'Sample ingest output must be outside a Git checkout.') throw error;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

export function runIngest(args: string[]): number {
  const [sourceType, sourcePath, ...options] = args;
  let owner = ''; let output = ''; const blockedWords: string[] = [];
  for (const option of options) {
    if (option.startsWith('--owner=')) owner = option.slice('--owner='.length);
    else if (option.startsWith('--output=')) output = option.slice('--output='.length);
    else if (option.startsWith('--blocked=')) blockedWords.push(option.slice('--blocked='.length));
    else throw new Error('Usage: hyv ingest <gmail-sent-mbox|telegram-desktop-json> export --owner=owner --output=/absolute/safe-directory [--blocked=word]');
  }
  if (!sourcePath || !owner || !output || !['gmail-sent-mbox', 'telegram-desktop-json'].includes(sourceType ?? '')) throw new Error('Usage: hyv ingest <gmail-sent-mbox|telegram-desktop-json> export --owner=owner --output=/absolute/safe-directory [--blocked=word]');
  outputOutsideGitCheckout(output);
  const result = sourceType === 'gmail-sent-mbox'
    ? ingestGmailSentMbox(input(sourcePath), owner, blockedWords)
    : ingestTelegramDesktopJson(input(sourcePath), owner, blockedWords);
  const outputDirectory = realpathSync(output);
  const samplesPath = join(outputDirectory, 'samples.jsonl'); const receiptPath = join(outputDirectory, 'receipt.json');
  try { writeFileSync(samplesPath, result.samples.map((sample) => JSON.stringify({ text: sample })).join('\n') + (result.samples.length ? '\n' : ''), { encoding: 'utf8', flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Sample ingest output directory must already exist and remain outside a Git checkout.');
    throw error;
  }
  try { writeFileSync(receiptPath, JSON.stringify(result.receipt, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 }); }
  catch (error) {
    try { rmSync(samplesPath, { force: true }); } catch {}
    throw error;
  }
  json(result.receipt);
  return 0;
}

export function runTeamProfile(args: string[]): number {
  const [action, bundlePath, authorPath, ...brandPaths] = args;
  if (action === 'validate' && bundlePath && !authorPath) { json(parseTeamProfileBundle(readJson(bundlePath))); return 0; }
  if (action === 'compose' && bundlePath && authorPath) {
    const brands = brandPaths.map(readProfile).filter((profile): profile is ProfileV3 => profile.version === '3');
    if (brands.length !== brandPaths.length) throw new Error('Team brand profiles must use Profile v3.');
    json(composeTeamProfile(readProfile(authorPath), brands, parseTeamProfileBundle(readJson(bundlePath))));
    return 0;
  }
  throw new Error('Usage: hyv team-profile <validate bundle.json|compose bundle.json author-profile.json [brand-profile.json...]>');
}

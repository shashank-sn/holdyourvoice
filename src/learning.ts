import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, mkdirSync, openSync, readSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Finding, Profile, Verification } from './contracts.js';

const MAX_PREFERENCES = 10;
const MAX_EVENTS = 40;
const MAX_RESOLVED_FINDINGS = 20;
const MAX_INSTRUCTION_CHARACTERS = 240;
const MAX_COMPOSED_CHARACTERS = 1_200;
const MAX_STORAGE_BYTES = 64 * 1024;

export interface LearningOptions {
  root?: string;
}

export interface LearningPreference {
  text: string;
  count: number;
}

export type LearningCaptureStatus = 'recorded' | 'nothing_to_learn' | 'write_failed';

interface ResolvedFinding {
  engine: Finding['engine'];
  id: string;
  severity: Finding['severity'];
  count: number;
}

interface LearningEvent {
  version: '1';
  timestamp: string;
  kind: 'verified_candidate' | 'instruction';
  resolved?: ResolvedFinding[];
  instruction?: string;
  outcome?: string;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function profileFingerprint(profile: Profile): string {
  return createHash('sha256').update(canonicalJson(profile)).digest('hex');
}

function learningDirectory(options: LearningOptions = {}): string {
  return join(options.root ?? process.env.HYV_HOME ?? join(homedir(), '.hyv'), 'learning');
}

function eventFile(profile: Profile, options: LearningOptions = {}): string {
  return join(learningDirectory(options), `${profileFingerprint(profile)}.jsonl`);
}

function isResolvedFinding(value: unknown): value is ResolvedFinding {
  if (!value || typeof value !== 'object') return false;
  const finding = value as Partial<ResolvedFinding>;
  return (finding.engine === 'voice_dna' || finding.engine === 'ai_editor')
    && typeof finding.id === 'string' && finding.id.length > 0
    && (finding.severity === 'red' || finding.severity === 'yellow')
    && Number.isInteger(finding.count) && (finding.count ?? 0) > 0;
}

function parseEvent(line: string): LearningEvent | undefined {
  try {
    const event = JSON.parse(line) as Partial<LearningEvent>;
    if (!event || event.version !== '1' || typeof event.timestamp !== 'string') return undefined;
    if (event.kind === 'instruction' && typeof event.instruction === 'string' && event.instruction.trim().length > 0 && event.instruction.length <= MAX_INSTRUCTION_CHARACTERS) {
      return { version: '1', timestamp: event.timestamp, kind: 'instruction', instruction: event.instruction };
    }
    const resolved = event.resolved;
    if (event.kind === 'verified_candidate' && Array.isArray(resolved) && resolved.length > 0 && resolved.every(isResolvedFinding) && typeof event.outcome === 'string') {
      return { version: '1', timestamp: event.timestamp, kind: 'verified_candidate', resolved, outcome: event.outcome };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readRecentText(file: string): string {
  try {
    const size = statSync(file).size;
    const length = Math.min(size, MAX_STORAGE_BYTES);
    const descriptor = openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(length);
      readSync(descriptor, buffer, 0, length, Math.max(0, size - length));
      return buffer.toString('utf8');
    } finally {
      closeSync(descriptor);
    }
  } catch {
    return '';
  }
}

function readEvents(profile: Profile, options: LearningOptions = {}): LearningEvent[] {
  const file = eventFile(profile, options);
  return readRecentText(file).split('\n').flatMap((line) => {
    const event = parseEvent(line);
    return event ? [event] : [];
  }).slice(-MAX_EVENTS);
}

function serialize(events: LearningEvent[]): string {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

function appendEvent(profile: Profile, event: LearningEvent, options: LearningOptions = {}): boolean {
  try {
    const directory = learningDirectory(options);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = eventFile(profile, options);
    const line = `${JSON.stringify(event)}\n`;
    const events = readEvents(profile, options);
    const needsCompaction = events.length >= MAX_EVENTS || (statSync(file, { throwIfNoEntry: false })?.size ?? 0) + Buffer.byteLength(line) > MAX_STORAGE_BYTES;
    if (needsCompaction) {
      const retained = [...events, event].slice(-MAX_EVENTS);
      while (Buffer.byteLength(serialize(retained)) > MAX_STORAGE_BYTES) retained.shift();
      writeFileSync(file, serialize(retained), { encoding: 'utf8', mode: 0o600 });
    } else {
      appendFileSync(file, line, { encoding: 'utf8', mode: 0o600 });
    }
    return true;
  } catch {
    return false;
  }
}

function countFindings(findings: Finding[]): Map<string, { finding: Finding; count: number }> {
  const counted = new Map<string, { finding: Finding; count: number }>();
  for (const finding of findings) {
    const key = `${finding.engine}:${finding.id}:${finding.severity}`;
    const entry = counted.get(key);
    if (entry) entry.count += 1;
    else counted.set(key, { finding, count: 1 });
  }
  return counted;
}

export function recordVerifiedCandidate(profile: Profile, verification: Verification, options: LearningOptions = {}): LearningCaptureStatus {
  if (!verification.passed) return 'nothing_to_learn';
  const original = countFindings([...verification.original.voiceDna.findings, ...verification.original.aiEditor.findings]);
  const candidate = countFindings([...verification.candidate.voiceDna.findings, ...verification.candidate.aiEditor.findings]);
  const resolved = [...original].flatMap(([key, entry]) => {
    const count = entry.count - (candidate.get(key)?.count ?? 0);
    return count > 0 ? [{ engine: entry.finding.engine, id: entry.finding.id, severity: entry.finding.severity, count }] : [];
  });
  if (!resolved.length) return 'nothing_to_learn';
  const bounded = resolved.slice(0, MAX_RESOLVED_FINDINGS);
  const outcome = createHash('sha256').update(canonicalJson(bounded)).digest('hex');
  if (readEvents(profile, options).some((event) => event.kind === 'verified_candidate' && event.outcome === outcome)) return 'nothing_to_learn';
  return appendEvent(profile, { version: '1', timestamp: new Date().toISOString(), kind: 'verified_candidate', resolved: bounded, outcome }, options) ? 'recorded' : 'write_failed';
}

export function addLearningInstruction(profile: Profile, instruction: string, options: LearningOptions = {}): boolean {
  const trimmed = instruction.replace(/\s+/g, ' ').trim();
  if (!trimmed) throw new Error('Learning instructions cannot be empty.');
  if (trimmed.length > MAX_INSTRUCTION_CHARACTERS) throw new Error(`Learning instructions must be ${MAX_INSTRUCTION_CHARACTERS} characters or fewer.`);
  return appendEvent(profile, { version: '1', timestamp: new Date().toISOString(), kind: 'instruction', instruction: trimmed }, options);
}

export function composeLearning(profile: Profile, options: LearningOptions = {}): LearningPreference[] {
  const preferences = new Map<string, { count: number; lastSeen: string }>();
  for (const event of readEvents(profile, options)) {
    const texts = event.kind === 'instruction' && event.instruction
      ? [{ text: event.instruction, count: 1 }]
      : (event.resolved ?? []).map((finding) => ({ text: `Previously verified repair: ${finding.engine}/${finding.id}.`, count: finding.count }));
    for (const { text, count } of texts) {
      const current = preferences.get(text) ?? { count: 0, lastSeen: event.timestamp };
      current.count += count;
      if (event.timestamp > current.lastSeen) current.lastSeen = event.timestamp;
      preferences.set(text, current);
    }
  }
  const result: LearningPreference[] = [];
  let characters = 0;
  for (const [text, value] of [...preferences.entries()]
    .sort(([firstText, first], [secondText, second]) => second.count - first.count || second.lastSeen.localeCompare(first.lastSeen) || firstText.localeCompare(secondText))
    .slice(0, MAX_PREFERENCES)) {
    if (characters + text.length > MAX_COMPOSED_CHARACTERS) break;
    result.push({ text, count: value.count });
    characters += text.length;
  }
  return result;
}

export function clearLearning(profile: Profile, options: LearningOptions = {}): boolean {
  const file = eventFile(profile, options);
  try {
    unlinkSync(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

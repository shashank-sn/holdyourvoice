import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Finding, Profile, ProfileV2, ProfileV3, Verification } from './contracts.js';

const MAX_PREFERENCES = 10;
const MAX_EVENTS = 40;
const MAX_RESOLVED_FINDINGS = 20;
const MAX_INSTRUCTION_CHARACTERS = 240;
const MAX_COMPOSED_CHARACTERS = 1_200;
const MAX_STORAGE_BYTES = 64 * 1024;

export type LearningAuthority = 'founder' | 'team' | 'system';
export type LearningCompatibility = 'same-or-newer' | 'exact';

export interface LearningOptions {
  root?: string;
  mutationId?: string;
  authority?: LearningAuthority;
  provenance?: string;
  weight?: number;
  compatibility?: LearningCompatibility;
}

export interface LearningPreference { text: string; count: number; }
export type LearningCaptureStatus = 'recorded' | 'nothing_to_learn' | 'write_failed';
export type LearningMutationStatus = 'recorded' | 'already_recorded' | 'not_found' | 'conflict' | 'unauthorized' | 'corrupt' | 'capacity_exceeded' | 'lock_timeout' | 'write_failed';

export interface LearningMutationReceipt {
  version: '1';
  mutationId: string;
  eventId: string;
  profileId: string;
  profileRevision: number;
  status: LearningMutationStatus;
  digest: string;
  timestamp: string;
}

export interface LearningInspection {
  version: '1';
  eventId: string;
  mutationId: string;
  eventType: LearningEvent['kind'];
  timestamp: string;
  profileRevision: number;
  authority: LearningAuthority;
  weight: number;
  compatibility: LearningCompatibility;
  status: 'active' | 'incompatible' | 'superseded' | 'control';
  targetEventId?: string;
}

interface ResolvedFinding {
  engine: Finding['engine']; id: string; severity: Finding['severity']; count: number;
}

interface LearningEvent {
  version: '2';
  eventId: string;
  mutationId: string;
  requestDigest: string;
  timestamp: string;
  profileRevision: number;
  revisionDigest: string;
  authority: LearningAuthority;
  provenance: string;
  weight: number;
  compatibility: LearningCompatibility;
  kind: 'verified_candidate' | 'instruction' | 'ratification' | 'supersession' | 'migration';
  resolved?: ResolvedFinding[];
  instruction?: string;
  outcome?: string;
  targetEventId?: string;
  sourceProfile?: string;
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

function identity(profile: Profile): string { return profile.version === '3' ? profile.id : profileFingerprint(profile); }
function revision(profile: Profile): number { return profile.version === '3' ? profile.revision : 1; }
function revisionDigest(profile: Profile): string { return profile.version === '3' ? profile.revisionDigest : profileFingerprint(profile); }
function learningDirectory(options: LearningOptions = {}): string { return join(options.root ?? process.env.HYV_HOME ?? join(homedir(), '.hyv'), 'learning'); }
function eventFile(profile: Profile, options: LearningOptions = {}): string { return join(learningDirectory(options), `${identity(profile)}.jsonl`); }
function normalizeInstruction(instruction: string): string { return instruction.replace(/\s+/g, ' ').trim(); }
function digest(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }

function isResolvedFinding(value: unknown): value is ResolvedFinding {
  if (!value || typeof value !== 'object') return false;
  const finding = value as Partial<ResolvedFinding>;
  return (finding.engine === 'voice_dna' || finding.engine === 'ai_editor') && typeof finding.id === 'string' && finding.id.length > 0
    && (finding.severity === 'red' || finding.severity === 'yellow') && Number.isInteger(finding.count) && (finding.count ?? 0) > 0;
}

function parseEvent(line: string, lineNumber = 0): LearningEvent | undefined {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (parsed.version === '1' && typeof parsed.timestamp === 'string') {
      const legacyId = digest({ version: '1', timestamp: parsed.timestamp, kind: parsed.kind, lineNumber });
      const base: LearningEvent = {
        version: '2', eventId: legacyId, mutationId: `legacy:${legacyId}`, timestamp: parsed.timestamp,
        profileRevision: 1, revisionDigest: 'legacy-v1', authority: 'system', provenance: 'hyv-3.2.0', weight: 1,
        compatibility: 'same-or-newer', kind: parsed.kind as LearningEvent['kind'], requestDigest: legacyId,
      };
      if (parsed.kind === 'instruction') {
        const instruction = normalizeInstruction(typeof parsed.instruction === 'string' ? parsed.instruction : '');
        return instruction && instruction.length <= MAX_INSTRUCTION_CHARACTERS ? { ...base, instruction } : undefined;
      }
      if (parsed.kind === 'verified_candidate' && Array.isArray(parsed.resolved) && parsed.resolved.length > 0 && parsed.resolved.every(isResolvedFinding) && typeof parsed.outcome === 'string') {
        return { ...base, resolved: parsed.resolved, outcome: parsed.outcome };
      }
      return undefined;
    }
    const value = parsed as Partial<LearningEvent>;
    if (value.version !== '2' || typeof value.eventId !== 'string' || typeof value.mutationId !== 'string' || typeof value.requestDigest !== 'string' || typeof value.timestamp !== 'string'
      || !Number.isSafeInteger(value.profileRevision) || (value.profileRevision ?? 0) < 1 || typeof value.revisionDigest !== 'string'
      || !['founder', 'team', 'system'].includes(value.authority ?? '') || typeof value.provenance !== 'string'
      || typeof value.weight !== 'number' || !Number.isFinite(value.weight) || value.weight <= 0
      || !['same-or-newer', 'exact'].includes(value.compatibility ?? '')
      || !['verified_candidate', 'instruction', 'ratification', 'supersession', 'migration'].includes(value.kind ?? '')) return undefined;
    if (value.kind === 'instruction') {
      const instruction = normalizeInstruction(value.instruction ?? '');
      if (!instruction || instruction.length > MAX_INSTRUCTION_CHARACTERS) return undefined;
      value.instruction = instruction;
    }
    if (value.kind === 'verified_candidate' && (!Array.isArray(value.resolved) || !value.resolved.length || !value.resolved.every(isResolvedFinding) || typeof value.outcome !== 'string')) return undefined;
    if ((value.kind === 'ratification' || value.kind === 'supersession') && typeof value.targetEventId !== 'string') return undefined;
    return value as LearningEvent;
  } catch { return undefined; }
}

function readEventsFromFile(file: string): LearningEvent[] {
  let contents: string;
  try { contents = readFileSync(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  return contents.split('\n').flatMap((line, index) => {
    if (!line.trim()) return [];
    const event = parseEvent(line, index + 1);
    if (!event) throw new Error(`Learning store is corrupt at line ${index + 1}.`);
    return [event];
  });
}
function readEvents(profile: Profile, options: LearningOptions = {}): LearningEvent[] { return readEventsFromFile(eventFile(profile, options)); }
function serialize(events: LearningEvent[]): string { return events.length ? `${events.map((event) => JSON.stringify(event)).join('\n')}\n` : ''; }

function learningState(events: LearningEvent[], profile: Profile) {
  return {
    superseded: new Set(events.filter((event) => event.kind === 'supersession').map((event) => event.targetEventId)),
    ratified: new Set(events.filter((event) => event.kind === 'ratification' && event.profileRevision <= revision(profile)).map((event) => event.targetEventId)),
  };
}

function isCompatible(event: LearningEvent, profile: Profile): boolean {
  return event.profileRevision <= revision(profile)
    && (event.compatibility === 'same-or-newer' || event.profileRevision === revision(profile));
}

function withLock<T>(file: string, operation: () => T): T | undefined {
  const lock = `${file}.lock`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let descriptor: number;
    try {
      descriptor = openSync(lock, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      continue;
    }
    try { return operation(); }
    finally { closeSync(descriptor); unlinkSync(lock); }
  }
  return undefined;
}

function withLocks<T>(files: string[], operation: () => T): T | undefined {
  const unique = [...new Set(files)].sort();
  const acquire = (index: number): T | undefined => index === unique.length ? operation() : withLock(unique[index]!, () => acquire(index + 1));
  return acquire(0);
}

const authorityRank: Record<LearningAuthority, number> = { founder: 3, team: 2, system: 1 };
function compact(events: LearningEvent[]): LearningEvent[] {
  const content = events.filter((event) => event.kind === 'instruction' || event.kind === 'verified_candidate')
    .sort((a, b) => authorityRank[b.authority] - authorityRank[a.authority] || b.weight - a.weight || b.timestamp.localeCompare(a.timestamp) || a.eventId.localeCompare(b.eventId));
  const selected = new Set(content.slice(0, MAX_EVENTS).map((event) => event.eventId));
  const controls = events.filter((event) => event.kind === 'migration' || ((event.kind === 'ratification' || event.kind === 'supersession') && selected.has(event.targetEventId ?? '')));
  while (selected.size + controls.length > MAX_EVENTS) selected.delete(content[[...selected].length - 1]?.eventId ?? '');
  const retained = events.filter((event) => selected.has(event.eventId) || (event.kind === 'migration') || ((event.kind === 'ratification' || event.kind === 'supersession') && selected.has(event.targetEventId ?? '')))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.eventId.localeCompare(b.eventId));
  while (retained.length && Buffer.byteLength(serialize(retained)) > MAX_STORAGE_BYTES) {
    const removable = retained.findIndex((event) => event.kind === 'instruction' || event.kind === 'verified_candidate');
    retained.splice(removable < 0 ? 0 : removable, 1);
  }
  return retained;
}

function writeEventsAtomically(file: string, events: LearningEvent[]): void {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, serialize(compact(events)), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* best-effort cleanup */ }
    throw error;
  }
}

function receipt(profile: Profile, event: LearningEvent, status: LearningMutationStatus): LearningMutationReceipt {
  const publicMetadata = { mutationId: event.mutationId, eventId: event.eventId, profileId: identity(profile), profileRevision: revision(profile), status, timestamp: event.timestamp };
  return { version: '1', ...publicMetadata, digest: digest(publicMetadata) };
}

function eventBase(profile: Profile, kind: LearningEvent['kind'], options: LearningOptions): LearningEvent {
  const mutationId = options.mutationId ?? randomUUID();
  const base = {
    version: '2', eventId: digest({ profile: identity(profile), mutationId }), mutationId, timestamp: new Date().toISOString(),
    profileRevision: revision(profile), revisionDigest: revisionDigest(profile), authority: options.authority ?? 'team',
    provenance: options.provenance ?? 'local', weight: options.weight ?? 1, compatibility: options.compatibility ?? 'same-or-newer', kind,
  } as LearningEvent;
  return { ...base, requestDigest: digest({ ...base, eventId: undefined, timestamp: undefined, requestDigest: undefined }) };
}

function mutate(profile: Profile, event: LearningEvent, options: LearningOptions, validate?: (events: LearningEvent[]) => LearningMutationStatus | undefined): LearningMutationReceipt {
  try {
    const directory = learningDirectory(options); mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = eventFile(profile, options);
    const result = withLock(file, () => {
      const events = readEventsFromFile(file);
      const existing = events.find((item) => item.mutationId === event.mutationId);
      if (existing) return receipt(profile, existing, existing.requestDigest === event.requestDigest ? 'already_recorded' : 'conflict');
      const invalid = validate?.(events); if (invalid) return receipt(profile, event, invalid);
      writeEventsAtomically(file, [...events, event]);
      return receipt(profile, event, 'recorded');
    });
    return result ?? receipt(profile, event, 'lock_timeout');
  } catch (error) { return receipt(profile, event, (error as Error).message.includes('corrupt') ? 'corrupt' : 'write_failed'); }
}

function countFindings(findings: Finding[]): Map<string, { finding: Finding; count: number }> {
  const counted = new Map<string, { finding: Finding; count: number }>();
  for (const finding of findings) {
    const key = `${finding.engine}:${finding.id}:${finding.severity}`;
    const entry = counted.get(key); if (entry) entry.count += 1; else counted.set(key, { finding, count: 1 });
  }
  return counted;
}

export function recordVerifiedCandidate(profile: Profile, verification: Verification, candidate: string, options: LearningOptions = {}): LearningCaptureStatus {
  if (!verification.passed) return 'nothing_to_learn';
  const original = countFindings([...verification.original.voiceDna.findings, ...verification.original.aiEditor.findings]);
  const candidateFindings = countFindings([...verification.candidate.voiceDna.findings, ...verification.candidate.aiEditor.findings]);
  const resolved = [...original].flatMap(([key, entry]) => { const count = entry.count - (candidateFindings.get(key)?.count ?? 0); return count > 0 ? [{ engine: entry.finding.engine, id: entry.finding.id, severity: entry.finding.severity, count }] : []; });
  if (!resolved.length) return 'nothing_to_learn';
  const outcome = createHash('sha256').update(`${identity(profile)}\0${candidate}`).digest('hex');
  if (readEvents(profile, options).some((event) => event.kind === 'verified_candidate' && event.outcome === outcome)) return 'nothing_to_learn';
  const event = { ...eventBase(profile, 'verified_candidate', { ...options, mutationId: options.mutationId ?? outcome }), resolved: resolved.slice(0, MAX_RESOLVED_FINDINGS), outcome };
  event.requestDigest = digest({ ...event, eventId: undefined, timestamp: undefined, requestDigest: undefined });
  const result = mutate(profile, event, options);
  return result.status === 'recorded' ? 'recorded' : result.status === 'already_recorded' ? 'nothing_to_learn' : 'write_failed';
}

export function recordLearningInstruction(profile: Profile, instruction: string, options: LearningOptions = {}): LearningMutationReceipt {
  const normalized = normalizeInstruction(instruction);
  if (!normalized) throw new Error('Learning instructions cannot be empty.');
  if (normalized.length > MAX_INSTRUCTION_CHARACTERS) throw new Error(`Learning instructions must be ${MAX_INSTRUCTION_CHARACTERS} characters or fewer.`);
  const event = { ...eventBase(profile, 'instruction', options), instruction: normalized };
  event.requestDigest = digest({ ...event, eventId: undefined, timestamp: undefined, requestDigest: undefined });
  return mutate(profile, event, options);
}
export function addLearningInstruction(profile: Profile, instruction: string, options: LearningOptions = {}): boolean { return recordLearningInstruction(profile, instruction, options).status === 'recorded'; }

export function ratifyLearningEvent(profile: ProfileV3, targetEventId: string, options: LearningOptions = {}): LearningMutationReceipt {
  const event = { ...eventBase(profile, 'ratification', options), targetEventId };
  event.requestDigest = digest({ ...event, eventId: undefined, timestamp: undefined, requestDigest: undefined });
  return mutate(profile, event, options, (events) => { const target = events.find((item) => item.eventId === targetEventId); return !target ? 'not_found' : authorityRank[event.authority] < authorityRank[target.authority] ? 'unauthorized' : undefined; });
}
export function supersedeLearningEvent(profile: ProfileV3, targetEventId: string, options: LearningOptions = {}): LearningMutationReceipt {
  const event = { ...eventBase(profile, 'supersession', options), targetEventId };
  event.requestDigest = digest({ ...event, eventId: undefined, timestamp: undefined, requestDigest: undefined });
  return mutate(profile, event, options, (events) => { const target = events.find((item) => item.eventId === targetEventId); return !target ? 'not_found' : authorityRank[event.authority] < authorityRank[target.authority] ? 'unauthorized' : undefined; });
}

export function migrateLearningV2ToV3(source: ProfileV2, target: ProfileV3, options: LearningOptions = {}): LearningMutationReceipt {
  const sourceFingerprint = profileFingerprint(source);
  const migrationId = options.mutationId ?? `migration:${digest({ source: sourceFingerprint, target: target.id, revision: target.revision })}`;
  const migrationOptions = { ...options, mutationId: migrationId };
  const marker = { ...eventBase(target, 'migration', migrationOptions), sourceProfile: sourceFingerprint };
  try {
    const directory = learningDirectory(options); mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = eventFile(target, options); const sourceFile = eventFile(source, options);
    const result = withLocks([sourceFile, file], () => {
      const targetEvents = readEventsFromFile(file);
      const existing = targetEvents.find((event) => event.mutationId === marker.mutationId);
      if (existing) return receipt(target, existing, 'already_recorded');
      const migrated = readEventsFromFile(sourceFile).filter((event) => event.kind === 'instruction' || event.kind === 'verified_candidate').map((event) => ({
        ...event, eventId: digest({ target: target.id, source: event.eventId }), mutationId: `migration:${marker.mutationId}:${event.mutationId}`,
        profileRevision: target.revision, revisionDigest: target.revisionDigest, provenance: `migration:${sourceFingerprint}`,
      }));
      const intended = [...targetEvents, ...migrated, marker]; const compacted = compact(intended);
      if (migrated.some((event) => !compacted.some((item) => item.eventId === event.eventId)) || !compacted.some((item) => item.eventId === marker.eventId)) return receipt(target, marker, 'capacity_exceeded');
      writeEventsAtomically(file, intended);
      return receipt(target, marker, 'recorded');
    });
    return result ?? receipt(target, marker, 'lock_timeout');
  } catch (error) { return receipt(target, marker, (error as Error).message.includes('corrupt') ? 'corrupt' : 'write_failed'); }
}

export function inspectLearning(profile: Profile, options: LearningOptions = {}): LearningInspection[] {
  const events = readEvents(profile, options);
  const { superseded, ratified } = learningState(events, profile);
  return events.slice(-MAX_EVENTS).map((event) => {
    const control = event.kind === 'ratification' || event.kind === 'supersession' || event.kind === 'migration';
    const status: LearningInspection['status'] = control ? 'control' : superseded.has(event.eventId) ? 'superseded' : isCompatible(event, profile) || ratified.has(event.eventId) ? 'active' : 'incompatible';
    return {
      version: '1', eventId: event.eventId, mutationId: event.mutationId, eventType: event.kind, timestamp: event.timestamp,
      profileRevision: event.profileRevision, authority: event.authority, weight: event.weight,
      compatibility: event.compatibility, status, ...(event.targetEventId ? { targetEventId: event.targetEventId } : {}),
    };
  });
}

export function composeLearning(profile: Profile, options: LearningOptions = {}): LearningPreference[] {
  const events = readEvents(profile, options);
  const { superseded, ratified } = learningState(events, profile);
  const preferences = new Map<string, { count: number; lastSeen: string; authority: number }>();
  for (const event of events) {
    if (event.kind !== 'instruction' && event.kind !== 'verified_candidate') continue;
    if (superseded.has(event.eventId)) continue;
    if (!isCompatible(event, profile) && !ratified.has(event.eventId)) continue;
    const texts = event.kind === 'instruction' && event.instruction ? [{ text: event.instruction, count: event.weight }]
      : (event.resolved ?? []).map((finding) => ({ text: `Previously verified repair: ${finding.engine}/${finding.id}.`, count: finding.count * event.weight }));
    for (const { text, count } of texts) {
      const current = preferences.get(text) ?? { count: 0, lastSeen: event.timestamp, authority: authorityRank[event.authority] };
      current.count += count; current.authority = Math.max(current.authority, authorityRank[event.authority]);
      if (event.timestamp > current.lastSeen) current.lastSeen = event.timestamp; preferences.set(text, current);
    }
  }
  const result: LearningPreference[] = []; let characters = 0;
  for (const [text, value] of [...preferences.entries()].sort(([aText, a], [bText, b]) => b.authority - a.authority || b.count - a.count || b.lastSeen.localeCompare(a.lastSeen) || aText.localeCompare(bText)).slice(0, MAX_PREFERENCES)) {
    if (characters + text.length > MAX_COMPOSED_CHARACTERS) break; result.push({ text, count: value.count }); characters += text.length;
  }
  return result;
}

export function clearLearning(profile: Profile, options: LearningOptions = {}): boolean {
  const file = eventFile(profile, options);
  try { const result = withLock(file, () => { try { unlinkSync(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }); if (result === undefined) throw new Error('Learning store lock timeout.'); return result; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

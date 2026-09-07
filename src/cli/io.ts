import { closeSync, constants, fstatSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { parseCopySpec } from '../copy-spec.js';
import type { ApprovalCapabilityEnvelopeV1, Profile, WritingBrief } from '../contracts.js';
import { parseWritingBrief } from '../editorial-packs.js';
import { parseProfile } from '../profile.js';
import { canonicalJson, parseCanonicalJson } from '../canonical-json.js';
import { MAX_JSON_BYTES } from '../internal.js';

export function input(path: string): string {
  return path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
}

function parseBoundedJson(text: string): unknown {
  if (Buffer.byteLength(text, 'utf8') > MAX_JSON_BYTES) throw new Error('JSON input exceeds the byte limit.');
  const value: unknown = JSON.parse(text); canonicalJson(value); return value;
}

function readBoundedDescriptor(descriptor: number): string {
  const chunks: Buffer[] = []; let size = 0;
  while (size <= MAX_JSON_BYTES) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_JSON_BYTES + 1 - size));
    const count = readSync(descriptor, chunk, 0, chunk.length, null); if (!count) break;
    chunks.push(chunk.subarray(0, count)); size += count;
  }
  if (size > MAX_JSON_BYTES) throw new Error('JSON input exceeds the byte limit.');
  return Buffer.concat(chunks, size).toString('utf8');
}

function withDescriptor<T>(path: string, flags: number, read: (descriptor: number) => T, openError?: string): T {
  let descriptor: number;
  try { descriptor = openSync(path, flags); }
  catch (error) { throw openError ? new Error(openError) : error; }
  try {
    return read(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function readJson(path: string): unknown {
  return path === '-'
    ? parseBoundedJson(readBoundedDescriptor(0))
    : withDescriptor(path, constants.O_RDONLY, (descriptor) => parseBoundedJson(readBoundedDescriptor(descriptor)));
}

function readCapabilityDescriptor(descriptor: number): string {
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.uid !== process.geteuid?.() || (before.mode & 0o077) !== 0 || before.nlink !== 1 || before.size > MAX_JSON_BYTES) {
      throw new Error('Capability file is unavailable or unsafe.');
    }
    const raw = readBoundedDescriptor(descriptor);
    const after = fstatSync(descriptor);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error('Capability file is unavailable or unsafe.');
    }
    return raw;
  } catch {
    throw new Error('Capability file is unavailable or unsafe.');
  }
}

export function capabilityArguments(args: string[]): { values: string[]; capability?: ApprovalCapabilityEnvelopeV1 } {
  const values: string[] = [];
  let source: { kind: 'stdin' } | { kind: 'file'; path: string } | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--capability-stdin') {
      if (source) throw new Error('Choose one capability source.');
      source = { kind: 'stdin' };
    } else if (argument === '--capability-file') {
      const path = args[++index];
      if (source || !path || path.startsWith('--capability-')) throw new Error('Choose one capability source.');
      source = { kind: 'file', path };
    } else {
      values.push(argument);
    }
  }
  if (!source) return { values };
  if (source.kind === 'stdin' && values.includes('-')) throw new Error('Capability stdin cannot be combined with another stdin input.');
  const raw = source.kind === 'stdin'
    ? readBoundedDescriptor(0)
    : withDescriptor(source.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0), readCapabilityDescriptor, 'Capability file is unavailable or unsafe.');
  if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BYTES) throw new Error('JSON input exceeds the byte limit.');
  return { values, capability: parseCanonicalJson(Buffer.from(raw, 'utf8')) as ApprovalCapabilityEnvelopeV1 };
}

export function readProfile(path: string): Profile {
  return parseProfile(JSON.parse(input(path)));
}

export function readBrief(path: string | undefined): WritingBrief | undefined {
  return path ? parseWritingBrief(JSON.parse(input(path))) : undefined;
}

function tryParse<T>(parse: (value: unknown) => T, value: unknown): T | undefined {
  try { return parse(value); } catch { return undefined; }
}

export function prepareContext(paths: string[]): { copySpec?: ReturnType<typeof parseCopySpec>; writingBrief?: WritingBrief } {
  let copySpec: ReturnType<typeof parseCopySpec> | undefined;
  let writingBrief: WritingBrief | undefined;
  for (const path of paths) {
    const value = JSON.parse(input(path));
    const parsedCopySpec = tryParse(parseCopySpec, value);
    if (parsedCopySpec) {
      if (copySpec) throw new Error('Prepare-rewrite accepts at most one CopySpec.');
      copySpec = parsedCopySpec;
      continue;
    }
    const parsedBrief = tryParse(parseWritingBrief, value);
    if (!parsedBrief) throw new Error(`Expected a valid CopySpec or WritingBrief at ${path}.`);
    if (writingBrief) throw new Error('Prepare-rewrite accepts at most one WritingBrief.');
    writingBrief = parsedBrief;
  }
  return { copySpec, writingBrief };
}

export function json(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function canonical(value: unknown): void { process.stdout.write(`${canonicalJson(value)}\n`); }

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

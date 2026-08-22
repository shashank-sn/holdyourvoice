import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENT_SCHEMA_VERSION,
  VALID_PERMISSIONS,
  VALID_UNAVAILABLE_STATUSES,
  type AgentDescriptor,
  type AgentPackage,
} from './types.js';

const MAX_MANIFEST_BYTES = 1 << 20;

export const SKILLS_DIRECTORY = 'skills';
const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DESCRIPTOR_KEYS = new Set(['schema_version', 'id', 'title', 'description', 'instruction_file', 'role', 'workflow_phase', 'input', 'output', 'evidence_requirements', 'permissions', 'stop_conditions', 'tool_free_mode', 'handoff_to']);
const IO_KEYS = new Set(['required', 'optional']);
const TOOL_FREE_MODE_KEYS = new Set(['available', 'behavior', 'unavailable_statuses']);

function isAgentDirectory(name: string): boolean {
  return name.startsWith('hyv-') && !name.startsWith('hyv-mcpb');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

function validIO(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, IO_KEYS) && stringArray(value.required) && stringArray(value.optional) && value.required.length > 0;
}

function validToolFreeMode(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, TOOL_FREE_MODE_KEYS)
    && value.available === true
    && typeof value.behavior === 'string' && value.behavior.length > 0
    && stringArray(value.unavailable_statuses) && value.unavailable_statuses.length > 0
    && value.unavailable_statuses.every((status) => VALID_UNAVAILABLE_STATUSES.has(status));
}

function validateDescriptor(value: unknown): string | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, DESCRIPTOR_KEYS)) return 'manifest must contain only the supported contract fields';
  const descriptor = value as unknown as AgentDescriptor;
  if (descriptor.schema_version !== AGENT_SCHEMA_VERSION) return `unsupported schema_version "${descriptor.schema_version}"`;
  if (![descriptor.id, descriptor.title, descriptor.description, descriptor.instruction_file, descriptor.role, descriptor.workflow_phase].every((value) => typeof value === 'string' && value.length > 0)) {
    return 'id, title, description, role, and workflow_phase are required';
  }
  if (descriptor.instruction_file !== 'SKILL.md') return 'instruction_file must be SKILL.md';
  if (!validIO(descriptor.input) || !validIO(descriptor.output)) {
    return 'input and output require at least one entry in required';
  }
  if (!stringArray(descriptor.evidence_requirements) || !stringArray(descriptor.stop_conditions) || !stringArray(descriptor.permissions) || !stringArray(descriptor.handoff_to)) {
    return 'evidence_requirements and stop_conditions require at least one entry';
  }
  if (!descriptor.evidence_requirements.length || !descriptor.stop_conditions.length) return 'evidence_requirements and stop_conditions require at least one entry';
  for (const permission of descriptor.permissions) {
    if (!VALID_PERMISSIONS.has(permission)) return `unsupported permission "${permission}"`;
  }
  if (!validToolFreeMode(descriptor.tool_free_mode)) {
    return 'tool_free_mode requires available and behavior';
  }
  return undefined;
}

function validOpenAiInterface(value: string): boolean {
  const lines = value.trimEnd().split('\n');
  const quotedString = (line: string | undefined, prefix: string): boolean => {
    if (!line?.startsWith(prefix)) return false;
    try {
      const parsed: unknown = JSON.parse(line.slice(prefix.length));
      return typeof parsed === 'string' && parsed.length > 0;
    } catch {
      return false;
    }
  };
  return lines.length === 4
    && lines[0] === 'interface:'
    && quotedString(lines[1], '  display_name: ')
    && quotedString(lines[2], '  short_description: ')
    && quotedString(lines[3], '  default_prompt: ');
}

function loadPackage(directory: string): AgentPackage {
  const manifestPath = join(directory, 'agent.json');
  const stat = lstatSync(manifestPath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`inspect manifest: ${manifestPath} must be a regular file`);
  if (stat.size > MAX_MANIFEST_BYTES) throw new Error(`inspect manifest: ${manifestPath} exceeds ${MAX_MANIFEST_BYTES} bytes`);
  const raw = readFileSync(manifestPath, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_MANIFEST_BYTES) throw new Error(`inspect manifest: ${manifestPath} exceeds ${MAX_MANIFEST_BYTES} bytes`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`parse manifest: ${manifestPath} is not valid JSON`);
  }
  const error = validateDescriptor(parsed);
  if (error) throw new Error(`validate manifest: ${manifestPath}: ${error}`);
  const descriptor = parsed as AgentDescriptor;
  const instructionPath = join(directory, descriptor.instruction_file);
  const instructionStat = lstatSync(instructionPath);
  if (instructionStat.isSymbolicLink() || !instructionStat.isFile()) {
    throw new Error(`inspect instructions: ${instructionPath} must be a regular file`);
  }
  const instructions = readFileSync(instructionPath, 'utf8');
  const interfacePath = join(directory, 'agents', 'openai.yaml');
  const interfaceStat = lstatSync(interfacePath);
  if (interfaceStat.isSymbolicLink() || !interfaceStat.isFile() || interfaceStat.size > MAX_MANIFEST_BYTES) {
    throw new Error(`inspect OpenAI interface: ${interfacePath} must be a regular file within ${MAX_MANIFEST_BYTES} bytes`);
  }
  const openai = readFileSync(interfacePath, 'utf8');
  if (Buffer.byteLength(openai, 'utf8') > MAX_MANIFEST_BYTES || !validOpenAiInterface(openai)) {
    throw new Error(`validate OpenAI interface: ${interfacePath} must contain the supported interface metadata`);
  }
  return { descriptor, directory, instructions };
}

function locateSkillsRoot(start: string): string {
  let current = start;
  for (;;) {
    const candidate = join(current, SKILLS_DIRECTORY);
    try {
      const stat = lstatSync(candidate);
      if (stat.isDirectory() && !stat.isSymbolicLink()) return candidate;
    } catch {
      // continue upward
    }
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`locate HYV package root: no ${SKILLS_DIRECTORY} directory found from ${start}`);
}

export function loadAllFrom(root: string): Map<string, AgentPackage> {
  const skillsRoot = locateSkillsRoot(root);
  const entries = readdirSync(skillsRoot, { withFileTypes: true });
  const packages = new Map<string, AgentPackage>();
  for (const entry of entries) {
    if (!entry.isDirectory() || !isAgentDirectory(entry.name)) continue;
    const loaded = loadPackage(join(skillsRoot, entry.name));
    if (loaded.descriptor.id !== entry.name) {
      throw new Error(`load ${entry.name}: id must match skill directory`);
    }
    if (packages.has(loaded.descriptor.id)) throw new Error(`duplicate agent id "${loaded.descriptor.id}"`);
    packages.set(loaded.descriptor.id, loaded);
  }
  for (const loaded of packages.values()) {
    for (const target of loaded.descriptor.handoff_to) {
      if (!packages.has(target)) throw new Error(`agent "${loaded.descriptor.id}" hands off to unknown agent "${target}"`);
    }
  }
  return packages;
}

export function loadAll(start = PACKAGE_ROOT): Map<string, AgentPackage> {
  return loadAllFrom(start);
}

export function sortedIds(packages: Map<string, AgentPackage>): string[] {
  return [...packages.keys()].sort();
}

export function validateAll(packages: Map<string, AgentPackage>): void {
  for (const loaded of packages.values()) {
    const error = validateDescriptor(loaded.descriptor);
    if (error) throw new Error(`validate manifest: ${loaded.directory}: ${error}`);
    for (const target of loaded.descriptor.handoff_to) {
      if (!packages.has(target)) throw new Error(`agent "${loaded.descriptor.id}" hands off to unknown agent "${target}"`);
    }
  }
}

export function validateId(packages: Map<string, AgentPackage>, id: string): void {
  if (!packages.has(id)) throw new Error(`unknown agent "${id}"`);
}

export function isAbsolutePath(value: string): boolean {
  return isAbsolute(value);
}

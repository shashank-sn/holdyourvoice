import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

export type BenchmarkAccessErrorCode = 'opt_in_required' | 'ci_forbidden' | 'location_unavailable' | 'location_unapproved' | 'manifest_unavailable' | 'manifest_unapproved' | 'retention_expired' | 'corpus_unavailable' | 'corpus_digest_mismatch';

export class BenchmarkAccessError extends Error {
  constructor(public readonly code: BenchmarkAccessErrorCode) {
    super(`Private benchmark unavailable (${code}).`);
    this.name = 'BenchmarkAccessError';
  }
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function isInsideGitRepository(path: string): boolean {
  let current = path;
  while (true) {
    if (existsSync(join(current, '.git'))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

interface PublicManifest {
  version: '1';
  provenance: string;
  baseline: { packageVersion: string; sourceCommit: string; rulesetVersion: string; ruleCount: number; orderedRuleIdsSha256: string; serializedRulesSha256: string; sha256: string };
  partitions: Array<{ id: string; sha256: string; cases: Array<{ id: string; file: string; sha256: string }> }>;
  preregisteredMeasures: string[];
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const PUBLIC_MEASURES = ['writer_preference', 'correction_versus_confirm', 'workflow_completion', 'workflow_abandonment'] as const;
const PUBLIC_PARTITIONS = ['development', 'calibration', 'locked-test'] as const;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function isNormalizedRelativeFile(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !isAbsolute(value) && !value.includes('\\')
    && posix.normalize(value) === value && value !== '..' && !value.startsWith('../') && !value.startsWith('/');
}

function parsePublicManifest(value: unknown): PublicManifest | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'provenance', 'baseline', 'partitions', 'preregisteredMeasures'])
    || value.version !== '1' || !isNonEmptyString(value.provenance) || !isRecord(value.baseline)
    || !hasExactKeys(value.baseline, ['packageVersion', 'sourceCommit', 'rulesetVersion', 'ruleCount', 'orderedRuleIdsSha256', 'serializedRulesSha256', 'sha256'])
    || !isNonEmptyString(value.baseline.packageVersion) || typeof value.baseline.sourceCommit !== 'string' || !GIT_COMMIT_PATTERN.test(value.baseline.sourceCommit)
    || !isNonEmptyString(value.baseline.rulesetVersion) || !Number.isSafeInteger(value.baseline.ruleCount) || (value.baseline.ruleCount as number) < 1
    || !isSha256(value.baseline.orderedRuleIdsSha256) || !isSha256(value.baseline.serializedRulesSha256) || !isSha256(value.baseline.sha256)
    || !Array.isArray(value.partitions) || value.partitions.length !== PUBLIC_PARTITIONS.length
    || !Array.isArray(value.preregisteredMeasures) || value.preregisteredMeasures.length !== PUBLIC_MEASURES.length
    || value.preregisteredMeasures.some((measure, index) => measure !== PUBLIC_MEASURES[index])) return undefined;

  const partitionIds = new Set<string>();
  for (const [index, partition] of value.partitions.entries()) {
    if (!isRecord(partition) || !hasExactKeys(partition, ['id', 'sha256', 'cases']) || !isNonEmptyString(partition.id) || partition.id !== PUBLIC_PARTITIONS[index]
      || partitionIds.has(partition.id) || !isSha256(partition.sha256) || !Array.isArray(partition.cases) || partition.cases.length === 0) return undefined;
    partitionIds.add(partition.id);
    for (const entry of partition.cases) {
      if (!isRecord(entry) || !hasExactKeys(entry, ['id', 'file', 'sha256']) || !isNonEmptyString(entry.id)
        || !isNormalizedRelativeFile(entry.file) || !entry.file.startsWith('cases/') || !isSha256(entry.sha256)) return undefined;
    }
  }
  return value as unknown as PublicManifest;
}

const HYV_320_BASELINE = {
  packageVersion: '3.2.0',
  sourceCommit: '4e6269121d551c008a34db73077e1e4fea41b3f9',
  rulesetVersion: '2.9.24-static.2',
  ruleCount: 145,
  orderedRuleIdsSha256: '04bc3d8f5631cc1eb3b42c1cd8b627d0d9a30fa02d8db094bae312f4f37b35b4',
  serializedRulesSha256: 'f24434156d237a00c3f86b7a745661841f79e011930d7fb978cb07b1a0d8ebe4',
};

export function validatePublicBenchmark(benchmarkRoot: string): PublicManifest {
  const root = realpathSync(benchmarkRoot);
  const manifestPath = realpathSync(resolve(root, 'manifest.json'));
  if (!isInside(root, manifestPath)) throw new Error('Public benchmark manifest is invalid.');
  const manifest = parsePublicManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  if (!manifest) throw new Error('Public benchmark manifest is invalid.');
  const { sha256: baselineSha256, ...baseline } = manifest.baseline;
  if (JSON.stringify(baseline) !== JSON.stringify(HYV_320_BASELINE) || sha256(JSON.stringify(baseline)) !== baselineSha256) throw new Error('Public benchmark baseline has drifted.');
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  for (const partition of manifest.partitions) {
    const partitionBinding = { version: manifest.version, provenance: manifest.provenance, baselineSha256, partition: { id: partition.id, cases: partition.cases } };
    if (sha256(JSON.stringify(partitionBinding)) !== partition.sha256) throw new Error('Public benchmark partition digest has drifted.');
    for (const entry of partition.cases) {
      if (seenIds.has(entry.id)) throw new Error('Public benchmark case belongs to multiple partitions.');
      seenIds.add(entry.id);
      const file = realpathSync(resolve(root, entry.file));
      if (!isInside(root, file)) throw new Error('Public benchmark case digest has drifted.');
      const contents = readFileSync(file);
      if (sha256(contents) !== entry.sha256) throw new Error('Public benchmark case digest has drifted.');
      if (seenFiles.has(file)) throw new Error('Public benchmark fixture belongs to multiple partitions.');
      seenFiles.add(file);
      const fixture = JSON.parse(contents.toString('utf8')) as unknown;
      if (!isRecord(fixture) || !hasExactKeys(fixture, ['version', 'id', 'provenance', 'partition', 'task_class', 'draft', 'expectation', ...('candidate' in fixture ? ['candidate'] : []), ...('counterexample' in fixture ? ['counterexample'] : []), ...('copy_spec' in fixture ? ['copy_spec'] : [])])
        || fixture.version !== '1' || !isNonEmptyString(fixture.task_class) || typeof fixture.draft !== 'string' || !isRecord(fixture.expectation)
        || ('candidate' in fixture && typeof fixture.candidate !== 'string') || ('counterexample' in fixture && typeof fixture.counterexample !== 'string')
        || ('copy_spec' in fixture && !isRecord(fixture.copy_spec))) throw new Error('Public benchmark case is invalid.');
      if (fixture.id !== entry.id) throw new Error('Public benchmark case identity has drifted.');
      if (fixture.partition !== partition.id || fixture.provenance !== manifest.provenance) throw new Error('Public benchmark fixture placement has drifted.');
    }
  }
  return manifest;
}

interface PrivateRightsManifest {
  version: '1';
  custodian: string;
  rights: { basis: string; status: 'approved'; approvedBy: string; approvedAt: string };
  encryptedLocalStorageAttestation: { approved: true; attestedBy: string; attestedAt: string };
  permittedUsers: string[];
  permittedEnvironments: string[];
  retention: { expiresAt: string; deletionProcedure: string };
  incidentOwner: string;
  corpus: { sha256: string; cases: Array<{ id: string; sha256: string; provenance: { sourceId: string; rightsBasis: string; approvedBy: string; approvedAt: string } }> };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = new Date(value);
  const canonical = value.includes('.') ? value : `${value.slice(0, -1)}.000Z`;
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === canonical;
}

function parsePrivateRightsManifest(value: unknown): PrivateRightsManifest | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'custodian', 'rights', 'encryptedLocalStorageAttestation', 'permittedUsers', 'permittedEnvironments', 'retention', 'incidentOwner', 'corpus'])
    || value.version !== '1' || !isNonEmptyString(value.custodian) || !isRecord(value.rights) || !hasExactKeys(value.rights, ['basis', 'status', 'approvedBy', 'approvedAt'])
    || !isNonEmptyString(value.rights.basis) || value.rights.status !== 'approved' || !isNonEmptyString(value.rights.approvedBy) || !isIsoInstant(value.rights.approvedAt)
    || !isRecord(value.encryptedLocalStorageAttestation) || !hasExactKeys(value.encryptedLocalStorageAttestation, ['approved', 'attestedBy', 'attestedAt']) || value.encryptedLocalStorageAttestation.approved !== true
    || !isNonEmptyString(value.encryptedLocalStorageAttestation.attestedBy) || !isIsoInstant(value.encryptedLocalStorageAttestation.attestedAt)
    || !Array.isArray(value.permittedUsers) || value.permittedUsers.length === 0 || !value.permittedUsers.every(isNonEmptyString) || new Set(value.permittedUsers).size !== value.permittedUsers.length
    || !Array.isArray(value.permittedEnvironments) || value.permittedEnvironments.length === 0 || !value.permittedEnvironments.every(isNonEmptyString) || new Set(value.permittedEnvironments).size !== value.permittedEnvironments.length
    || !isRecord(value.retention) || !hasExactKeys(value.retention, ['expiresAt', 'deletionProcedure']) || !isIsoInstant(value.retention.expiresAt) || !isNonEmptyString(value.retention.deletionProcedure)
    || !isNonEmptyString(value.incidentOwner) || !isRecord(value.corpus) || !hasExactKeys(value.corpus, ['sha256', 'cases']) || !isSha256(value.corpus.sha256)
    || !Array.isArray(value.corpus.cases) || value.corpus.cases.length === 0) return undefined;
  const caseIds = new Set<string>();
  for (const entry of value.corpus.cases) {
    if (!isRecord(entry) || !hasExactKeys(entry, ['id', 'sha256', 'provenance']) || !isNonEmptyString(entry.id) || caseIds.has(entry.id) || !isSha256(entry.sha256)
      || !isRecord(entry.provenance) || !hasExactKeys(entry.provenance, ['sourceId', 'rightsBasis', 'approvedBy', 'approvedAt'])
      || !isNonEmptyString(entry.provenance.sourceId) || !isNonEmptyString(entry.provenance.rightsBasis)
      || !isNonEmptyString(entry.provenance.approvedBy) || !isIsoInstant(entry.provenance.approvedAt)) return undefined;
    caseIds.add(entry.id);
  }
  return value as unknown as PrivateRightsManifest;
}

function validatePrivateCorpus(contents: string, manifest: PrivateRightsManifest): boolean {
  const lines = contents.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== manifest.corpus.cases.length) return false;
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    let value: unknown;
    try {
      value = JSON.parse(line!);
    } catch {
      return false;
    }
    const expected = manifest.corpus.cases[index]!;
    if (!isRecord(value) || !isNonEmptyString(value.id) || value.id !== expected.id || seen.has(value.id) || sha256(line!) !== expected.sha256) return false;
    seen.add(value.id);
  }
  return true;
}

export interface PrivateBenchmarkOptions {
  enabled: boolean;
  privateRoot: string;
  approvedStorageRoot: string;
  repositoryRoot: string;
  user: string;
  environment: string;
  now?: Date;
  ci?: boolean;
}

export function validatePrivateBenchmark(options: PrivateBenchmarkOptions): { version: '1'; corpusSha256: string } {
  if (!options.enabled) throw new BenchmarkAccessError('opt_in_required');
  if (Boolean(process.env.CI) || options.ci === true) throw new BenchmarkAccessError('ci_forbidden');
  let root: string;
  let approvedRoot: string;
  let repositoryRoot: string;
  try {
    root = realpathSync(options.privateRoot);
    approvedRoot = realpathSync(options.approvedStorageRoot);
    repositoryRoot = realpathSync(options.repositoryRoot);
  } catch {
    throw new BenchmarkAccessError('location_unavailable');
  }
  if (!isInside(approvedRoot, root) || isInside(repositoryRoot, root) || isInsideGitRepository(root)) throw new BenchmarkAccessError('location_unapproved');
  let manifest: PrivateRightsManifest | undefined;
  try {
    const manifestPath = realpathSync(resolve(root, 'rights-manifest.json'));
    if (!isInside(root, manifestPath)) throw new Error('outside root');
    manifest = parsePrivateRightsManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  } catch {
    throw new BenchmarkAccessError('manifest_unavailable');
  }
  if (!manifest || !manifest.permittedUsers.includes(options.user) || !manifest.permittedEnvironments.includes(options.environment)) throw new BenchmarkAccessError('manifest_unapproved');
  const expiresAt = Date.parse(manifest.retention.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= (options.now ?? new Date()).getTime()) throw new BenchmarkAccessError('retention_expired');
  let corpusSha256: string;
  try {
    const corpusPath = realpathSync(resolve(root, 'corpus.ndjson'));
    if (!isInside(root, corpusPath)) throw new Error('outside root');
    const corpusContents = readFileSync(corpusPath, 'utf8');
    corpusSha256 = sha256(corpusContents);
    if (!validatePrivateCorpus(corpusContents, manifest)) throw new BenchmarkAccessError('corpus_digest_mismatch');
  } catch (error) {
    if (error instanceof BenchmarkAccessError) throw error;
    throw new BenchmarkAccessError('corpus_unavailable');
  }
  if (corpusSha256 !== manifest.corpus.sha256) throw new BenchmarkAccessError('corpus_digest_mismatch');
  return { version: '1', corpusSha256 };
}

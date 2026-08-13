import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { analyzeAiEditor } from './ai-editor.js';
import { BenchmarkAccessError, validatePrivateBenchmark, validatePublicBenchmark } from './benchmark.js';
import { finalOutputCheck } from './hygiene.js';
import { comparePreservation } from './preservation.js';
import { applyRewriteResponse, prepareRewriteTask } from './rewrite-task.js';
import { buildProfile } from './voice-dna.js';

const repositoryRoot = process.cwd();

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function bindPublicPartition(manifest: Record<string, any>, index = 0): void {
  const partition = manifest.partitions[index];
  partition.sha256 = sha256Json({
    version: manifest.version,
    provenance: manifest.provenance,
    baselineSha256: manifest.baseline.sha256,
    partition: { id: partition.id, cases: partition.cases },
  });
}

function withPublicBenchmarkCopy(check: (benchmarkRoot: string) => void): void {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'hyv-public-benchmark-'));
  const benchmarkRoot = join(temporaryRoot, 'benchmarks');
  cpSync(join(repositoryRoot, 'benchmarks'), benchmarkRoot, { recursive: true });
  try {
    check(benchmarkRoot);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function withoutCi(check: () => void): void {
  const previousCi = process.env.CI;
  delete process.env.CI;
  try {
    check();
  } finally {
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
  }
}

test('locks the historical public partitions, Hyv 3.2.0 baseline, and preregistered measures independently of the live catalog', () => {
  const manifest = validatePublicBenchmark(join(repositoryRoot, 'benchmarks'));
  assert.deepEqual(manifest.preregisteredMeasures, ['writer_preference', 'correction_versus_confirm', 'workflow_completion', 'workflow_abandonment']);
  assert.deepEqual(manifest.partitions.map((partition) => partition.id), ['development', 'calibration', 'locked-test']);
  assert.equal(manifest.partitions.flatMap((partition) => partition.cases).length, 5);
  const polarity = JSON.parse(readFileSync(join(repositoryRoot, 'benchmarks/cases/synthetic-004.json'), 'utf8')) as { draft: string; candidate: string; expectation: { semantic_polarity: string } };
  assert.ok(comparePreservation(polarity.draft, polarity.candidate).orderedToken.wordSurvival >= 0.8);
  assert.equal(polarity.expectation.semantic_polarity, 'reject');
});

test('rejects public baseline, partition membership, identity, and fixture digest drift', () => {
  const manifestPath = (benchmarkRoot: string) => join(benchmarkRoot, 'manifest.json');
  const readManifest = (benchmarkRoot: string) => JSON.parse(readFileSync(manifestPath(benchmarkRoot), 'utf8')) as Record<string, any>;
  const writeManifest = (benchmarkRoot: string, manifest: unknown) => writeFileSync(manifestPath(benchmarkRoot), JSON.stringify(manifest));

  withPublicBenchmarkCopy((benchmarkRoot) => {
    const manifest = readManifest(benchmarkRoot);
    manifest.baseline.packageVersion = 'mutated-baseline';
    writeManifest(benchmarkRoot, manifest);
    assert.throws(() => validatePublicBenchmark(benchmarkRoot), /Public benchmark baseline has drifted/);
  });

  withPublicBenchmarkCopy((benchmarkRoot) => {
    const manifest = readManifest(benchmarkRoot);
    manifest.partitions[0].cases.push({ ...manifest.partitions[0].cases[0], id: 'synthetic-001-alias' });
    writeManifest(benchmarkRoot, manifest);
    assert.throws(() => validatePublicBenchmark(benchmarkRoot), /Public benchmark partition digest has drifted/);
  });

  withPublicBenchmarkCopy((benchmarkRoot) => {
    const manifest = readManifest(benchmarkRoot);
    const partition = manifest.partitions[0];
    partition.cases[0] = { ...manifest.partitions[0].cases[1], id: 'synthetic-001-alias' };
    bindPublicPartition(manifest);
    writeManifest(benchmarkRoot, manifest);
    assert.throws(() => validatePublicBenchmark(benchmarkRoot), /Public benchmark case identity has drifted/);
  });

  withPublicBenchmarkCopy((benchmarkRoot) => {
    writeFileSync(join(benchmarkRoot, 'cases/synthetic-001.json'), '{"mutated":true}\n');
    assert.throws(() => validatePublicBenchmark(benchmarkRoot), /Public benchmark case digest has drifted/);
  });
});

test('rejects malformed or under-bound public benchmark manifests before reading fixtures', () => {
  const manifestPath = (benchmarkRoot: string) => join(benchmarkRoot, 'manifest.json');
  const readManifest = (benchmarkRoot: string) => JSON.parse(readFileSync(manifestPath(benchmarkRoot), 'utf8')) as Record<string, any>;
  const writeManifest = (benchmarkRoot: string, manifest: unknown) => writeFileSync(manifestPath(benchmarkRoot), JSON.stringify(manifest));
  for (const mutate of [
    (manifest: Record<string, any>) => { manifest.unknown = true; },
    (manifest: Record<string, any>) => { manifest.provenance = ''; },
    (manifest: Record<string, any>) => { manifest.baseline.unknown = true; },
    (manifest: Record<string, any>) => { manifest.partitions = 'development'; },
    (manifest: Record<string, any>) => { manifest.partitions[0].sha256 = 'not-a-digest'; },
    (manifest: Record<string, any>) => { manifest.partitions[0].cases[0].unknown = true; },
    (manifest: Record<string, any>) => { manifest.preregisteredMeasures.push('made_up_measure'); },
    (manifest: Record<string, any>) => { manifest.preregisteredMeasures[1] = manifest.preregisteredMeasures[0]; },
  ]) {
    withPublicBenchmarkCopy((benchmarkRoot) => {
      const manifest = readManifest(benchmarkRoot);
      mutate(manifest);
      writeManifest(benchmarkRoot, manifest);
      assert.throws(() => validatePublicBenchmark(benchmarkRoot), /Public benchmark manifest is invalid/);
    });
  }

  withPublicBenchmarkCopy((benchmarkRoot) => {
    const manifest = readManifest(benchmarkRoot);
    manifest.partitions[0].cases[0].file = '../outside.json';
    bindPublicPartition(manifest);
    writeManifest(benchmarkRoot, manifest);
    assert.throws(() => validatePublicBenchmark(benchmarkRoot), /Public benchmark manifest is invalid/);
  });

  withPublicBenchmarkCopy((benchmarkRoot) => {
    const manifest = readManifest(benchmarkRoot);
    manifest.partitions[0].cases[0].file = 'cases/../cases/synthetic-001.json';
    bindPublicPartition(manifest);
    writeManifest(benchmarkRoot, manifest);
    assert.throws(() => validatePublicBenchmark(benchmarkRoot), /Public benchmark manifest is invalid/);
  });

  withPublicBenchmarkCopy((benchmarkRoot) => {
    const manifest = readManifest(benchmarkRoot);
    manifest.provenance = `${manifest.provenance} mutated`;
    writeManifest(benchmarkRoot, manifest);
    assert.throws(() => validatePublicBenchmark(benchmarkRoot), /Public benchmark partition digest has drifted/);
  });
});

test('rejects a public case symlink outside the benchmark before reading it', () => {
  withPublicBenchmarkCopy((benchmarkRoot) => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'hyv-public-outside-'));
    const outsideFile = join(outsideRoot, 'outside.json');
    writeFileSync(outsideFile, '{"private":"must not be read"}\n');
    const casePath = join(benchmarkRoot, 'cases/synthetic-001.json');
    rmSync(casePath);
    symlinkSync(outsideFile, casePath);
    try {
      assert.throws(() => validatePublicBenchmark(benchmarkRoot), /Public benchmark case digest has drifted/);
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

test('rejects a public manifest symlink outside the benchmark before reading it', () => {
  withPublicBenchmarkCopy((benchmarkRoot) => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'hyv-public-manifest-outside-'));
    const outsideFile = join(outsideRoot, 'manifest.json');
    writeFileSync(outsideFile, '{"private":"must not be read"}\n');
    const manifestPath = join(benchmarkRoot, 'manifest.json');
    rmSync(manifestPath);
    symlinkSync(outsideFile, manifestPath);
    try {
      assert.throws(() => validatePublicBenchmark(benchmarkRoot), /Public benchmark manifest is invalid/);
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

test('executes the synthetic rule, byte-preservation, and hygiene expectations', () => {
  const readCase = (id: string) => JSON.parse(readFileSync(join(repositoryRoot, `benchmarks/cases/${id}.json`), 'utf8')) as Record<string, any>;
  for (const id of ['synthetic-001', 'synthetic-002']) {
    const fixture = readCase(id);
    assert.deepEqual(analyzeAiEditor(fixture.draft).findings.map((finding) => finding.id), fixture.expectation.finding_ids);
    if (fixture.counterexample) assert.deepEqual(analyzeAiEditor(fixture.counterexample).findings.map((finding) => finding.id), fixture.expectation.counterexample_finding_ids);
  }

  const clean = readCase('synthetic-003');
  const profile = buildProfile([clean.draft, clean.draft]);
  const task = prepareRewriteTask(clean.draft, profile);
  const result = applyRewriteResponse(task, { version: '1', taskFingerprint: task.fingerprint, replacements: [] });
  assert.deepEqual(task.eligibleSentenceIds, []);
  assert.equal(result.candidate, clean.draft);

  const hygiene = readCase('synthetic-005');
  const checked = finalOutputCheck(hygiene.candidate);
  assert.equal(checked.accepted, false);
  assert.deepEqual(checked.remaining.hits.map((hit) => hit.codepoint), hygiene.expectation.codepoints);
});

test('private evaluation is opt-in, local-only, rights-gated, current, and digest-locked', () => {
  withoutCi(() => {
  const approvedRoot = mkdtempSync(join(tmpdir(), 'hyv-private-approved-'));
  const privateRoot = join(approvedRoot, 'corpus');
  mkdirSync(privateRoot);
  const privateCase = { id: 'private-001', text: 'private' };
  const source = `${JSON.stringify(privateCase)}\n`;
  writeFileSync(join(privateRoot, 'corpus.ndjson'), source);
  const manifest = {
    version: '1', custodian: 'custodian-1',
    rights: { basis: 'documented distribution approval', status: 'approved', approvedBy: 'approver-1', approvedAt: '2026-08-01T00:00:00Z' },
    encryptedLocalStorageAttestation: { approved: true, attestedBy: 'security-1', attestedAt: '2026-08-01T00:00:00Z' },
    permittedUsers: ['reviewer-1'], permittedEnvironments: ['local-evaluation'],
    retention: { expiresAt: '2026-09-01T00:00:00Z', deletionProcedure: 'Secure deletion ticket RET-1.' },
    incidentOwner: 'incident-owner-1', corpus: {
      sha256: createHash('sha256').update(source).digest('hex'),
      cases: [{
        id: privateCase.id,
        sha256: createHash('sha256').update(JSON.stringify(privateCase)).digest('hex'),
        provenance: { sourceId: 'source-001', rightsBasis: 'documented distribution approval', approvedBy: 'approver-1', approvedAt: '2026-08-01T00:00:00Z' },
      }],
    },
  };
  writeFileSync(join(privateRoot, 'rights-manifest.json'), JSON.stringify(manifest));
  const options = { enabled: true, privateRoot, approvedStorageRoot: approvedRoot, repositoryRoot, user: 'reviewer-1', environment: 'local-evaluation', now: new Date('2026-08-13T00:00:00Z'), ci: false };
  try {
    assert.equal(validatePrivateBenchmark(options).corpusSha256, manifest.corpus.sha256);
    assert.throws(() => validatePrivateBenchmark({ ...options, enabled: false }), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'opt_in_required');
    assert.throws(() => validatePrivateBenchmark({ ...options, ci: true }), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'ci_forbidden');
    assert.throws(() => validatePrivateBenchmark({ ...options, privateRoot: join(approvedRoot, 'missing') }), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'location_unavailable');
    const previousCi = process.env.CI;
    process.env.CI = '1';
    try {
      assert.throws(() => validatePrivateBenchmark({ ...options, ci: false }), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'ci_forbidden');
    } finally {
      if (previousCi === undefined) delete process.env.CI;
      else process.env.CI = previousCi;
    }
    assert.throws(() => validatePrivateBenchmark({ ...options, now: new Date('2026-10-01T00:00:00Z') }), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'retention_expired');
    rmSync(join(privateRoot, 'rights-manifest.json'));
    assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'manifest_unavailable');
    writeFileSync(join(privateRoot, 'rights-manifest.json'), 'null');
    assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'manifest_unapproved');
    writeFileSync(join(privateRoot, 'rights-manifest.json'), JSON.stringify({ ...manifest, rights: { ...manifest.rights, status: 'pending' } }));
    assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'manifest_unapproved');
    writeFileSync(join(privateRoot, 'rights-manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(privateRoot, 'corpus.ndjson'), `${source}source text that must stay private`);
    assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'corpus_digest_mismatch' && !error.message.includes('source text'));
    rmSync(join(privateRoot, 'corpus.ndjson'));
    assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'corpus_unavailable');
  } finally {
    rmSync(approvedRoot, { recursive: true, force: true });
  }
  });
});

test('private evaluation requires strict per-case rights and provenance without disclosing corpus data', () => {
  withoutCi(() => {
  const approvedRoot = mkdtempSync(join(tmpdir(), 'hyv-private-case-rights-'));
  const privateRoot = join(approvedRoot, 'corpus');
  mkdirSync(privateRoot);
  const privateCase = { id: 'private-001', text: 'sensitive source text' };
  const source = `${JSON.stringify(privateCase)}\n`;
  const caseRecord = {
    id: privateCase.id,
    sha256: createHash('sha256').update(JSON.stringify(privateCase)).digest('hex'),
    provenance: { sourceId: 'source-001', rightsBasis: 'approved study use', approvedBy: 'approver-1', approvedAt: '2026-08-01T00:00:00Z' },
  };
  const manifest = {
    version: '1', custodian: 'custodian-1',
    rights: { basis: 'documented distribution approval', status: 'approved', approvedBy: 'approver-1', approvedAt: '2026-08-01T00:00:00Z' },
    encryptedLocalStorageAttestation: { approved: true, attestedBy: 'security-1', attestedAt: '2026-08-01T00:00:00Z' },
    permittedUsers: ['reviewer-1'], permittedEnvironments: ['local-evaluation'],
    retention: { expiresAt: '2026-09-01T00:00:00Z', deletionProcedure: 'Secure deletion ticket RET-1.' },
    incidentOwner: 'incident-owner-1',
    corpus: { sha256: createHash('sha256').update(source).digest('hex'), cases: [caseRecord] },
  };
  writeFileSync(join(privateRoot, 'corpus.ndjson'), source);
  const manifestPath = join(privateRoot, 'rights-manifest.json');
  const options = { enabled: true, privateRoot, approvedStorageRoot: approvedRoot, repositoryRoot, user: 'reviewer-1', environment: 'local-evaluation', now: new Date('2026-08-13T00:00:00Z'), ci: false };
  try {
    for (const corpus of [
      { sha256: manifest.corpus.sha256 },
      { ...manifest.corpus, cases: [{ ...caseRecord, provenance: { ...caseRecord.provenance, approvedBy: '' } }] },
      { ...manifest.corpus, cases: [{ ...caseRecord, provenance: { ...caseRecord.provenance, approvedAt: '2026-02-31T00:00:00Z' } }] },
      { ...manifest.corpus, cases: [{ ...caseRecord, sha256: 'bad' }] },
      { ...manifest.corpus, cases: [caseRecord, caseRecord] },
    ]) {
      writeFileSync(manifestPath, JSON.stringify({ ...manifest, corpus }));
      assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'manifest_unapproved' && !error.message.includes(privateCase.text));
    }

    writeFileSync(manifestPath, JSON.stringify({ ...manifest, corpus: { ...manifest.corpus, cases: [{ ...caseRecord, id: 'private-002' }] } }));
    assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'corpus_digest_mismatch' && !error.message.includes(privateCase.text));

    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(join(privateRoot, 'corpus.ndjson'), `${JSON.stringify({ ...privateCase, id: 'private-002' })}\n`);
    assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'corpus_digest_mismatch' && !error.message.includes(privateCase.text));
  } finally {
    rmSync(approvedRoot, { recursive: true, force: true });
  }
  });
});

test('private evaluation refuses repository storage and missing manifests without disclosing a path', () => {
  const insideRepository = join(repositoryRoot, 'benchmarks');
  for (const options of [
    { enabled: true, privateRoot: insideRepository, approvedStorageRoot: repositoryRoot, repositoryRoot, user: 'x', environment: 'x', ci: false },
    { enabled: true, privateRoot: tmpdir(), approvedStorageRoot: tmpdir(), repositoryRoot, user: 'x', environment: 'x', ci: false },
  ]) {
    assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && !error.message.includes(options.privateRoot));
  }
});

test('private evaluation refuses a benchmark root carrying nested Git metadata', () => {
  withoutCi(() => {
  const approvedRoot = mkdtempSync(join(tmpdir(), 'hyv-private-git-metadata-'));
  const privateRoot = join(approvedRoot, 'corpus');
  mkdirSync(privateRoot);
  const privateCase = { id: 'private-001', text: 'private' };
  const source = `${JSON.stringify(privateCase)}\n`;
  const manifest = {
    version: '1', custodian: 'custodian-1',
    rights: { basis: 'documented distribution approval', status: 'approved', approvedBy: 'approver-1', approvedAt: '2026-08-01T00:00:00Z' },
    encryptedLocalStorageAttestation: { approved: true, attestedBy: 'security-1', attestedAt: '2026-08-01T00:00:00Z' },
    permittedUsers: ['reviewer-1'], permittedEnvironments: ['local-evaluation'],
    retention: { expiresAt: '2026-09-01T00:00:00Z', deletionProcedure: 'Secure deletion ticket RET-1.' },
    incidentOwner: 'incident-owner-1', corpus: {
      sha256: createHash('sha256').update(source).digest('hex'),
      cases: [{ id: privateCase.id, sha256: createHash('sha256').update(JSON.stringify(privateCase)).digest('hex'), provenance: { sourceId: 'source-001', rightsBasis: 'approved study use', approvedBy: 'approver-1', approvedAt: '2026-08-01T00:00:00Z' } }],
    },
  };
  writeFileSync(join(privateRoot, 'corpus.ndjson'), source);
  writeFileSync(join(privateRoot, 'rights-manifest.json'), JSON.stringify(manifest));
  const options = { enabled: true, privateRoot, approvedStorageRoot: approvedRoot, repositoryRoot, user: 'reviewer-1', environment: 'local-evaluation', now: new Date('2026-08-13T00:00:00Z'), ci: false };
  try {
    writeFileSync(join(privateRoot, '.git'), 'gitdir: /private/tmp/elsewhere\n');
    assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'location_unapproved');
    rmSync(join(privateRoot, '.git'));
    mkdirSync(join(privateRoot, '.git'));
    writeFileSync(join(privateRoot, '.git/HEAD'), 'ref: refs/heads/main\n');
    assert.throws(() => validatePrivateBenchmark(options), (error: unknown) => error instanceof BenchmarkAccessError && error.code === 'location_unapproved');
  } finally {
    rmSync(approvedRoot, { recursive: true, force: true });
  }
  });
});

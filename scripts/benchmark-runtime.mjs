import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(root, 'benchmarks/runtime/fixtures.json');
const manifestPath = join(root, 'benchmarks/runtime/manifest.json');
const fixtureBytes = readFileSync(fixturePath);
const fixtures = JSON.parse(fixtureBytes.toString('utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const [pipeline, voiceDna, aiEditor, hygiene, textTools, factLinter, canonical] = await Promise.all([
  import('../dist/pipeline.js'),
  import('../dist/voice-dna.js'),
  import('../dist/ai-editor.js'),
  import('../dist/hygiene.js'),
  import('../dist/text.js'),
  import('../dist/fact-linter.js'),
  import('../dist/canonical-json.js'),
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function repeatToLength(template, length) {
  const repetitions = Math.ceil(length / template.length);
  return template.repeat(repetitions).slice(0, length);
}

function buildProfileV3() {
  const base = voiceDna.buildProfile(fixtures.profileSamples, ['delve', 'leverage']);
  const fingerprint = voiceDna.measureFounderFingerprint(fixtures.profileSamples.join('\n\n'));
  const unsigned = {
    ...base,
    version: '3',
    id: 'benchmark.synthetic.v3',
    revision: 1,
    provenance: { source: 'synthetic runtime benchmark', rights: 'synthetic', createdAt: '2026-08-23T00:00:00.000Z' },
    rulePolicy: {},
    fingerprint,
    tolerances: {
      contractionRate: { absolute: 1, calibrated: false },
      sentenceLengthDistribution: { absolute: 1, calibrated: false },
      bulletRate: { absolute: 1, calibrated: false },
      enDashRate: { absolute: 1, calibrated: false },
    },
    metricFixtures: {
      contractionRate: ['benchmark.synthetic'],
      sentenceLengthDistribution: ['benchmark.synthetic'],
      bulletRate: ['benchmark.synthetic'],
      enDashRate: ['benchmark.synthetic'],
    },
  };
  return { ...unsigned, revisionDigest: sha256(canonical.canonicalJson(unsigned)) };
}

const natural = repeatToLength(fixtures.natural.template, fixtures.natural.targetCharacters);
const dotted = repeatToLength(fixtures.dotted.template, fixtures.dotted.targetCharacters);
const short = natural.slice(0, fixtures.short.targetCharacters);
const profile = buildProfileV3();
const factSources = Array.from({ length: fixtures.factLint.sourceCount }, (_, index) => ({
  id: `synthetic-${String(index + 1).padStart(2, '0')}`,
  text: repeatToLength(fixtures.factLint.sourceTemplate, fixtures.factLint.sourceCharacters),
}));
const factDraft = Array.from({ length: fixtures.factLint.draftCount }, () => fixtures.factLint.draftTemplate).join('\n');
const factInput = { sources: factSources, draft: factDraft };

let blackhole = 0;
let peakHeapBytes = process.memoryUsage().heapUsed;

function blackholeValue(value) {
  if (Array.isArray(value)) blackhole ^= value.length;
  else if (typeof value === 'object' && value !== null) {
    const candidate = value.findings ?? value.hits ?? value.claims ?? value.output ?? value.cleaned;
    blackhole ^= Array.isArray(candidate) ? candidate.length : String(candidate ?? '').length;
  } else blackhole ^= String(value ?? '').length;
}

function consume(value) {
  blackholeValue(value);
  peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
}

function elapsedMilliseconds(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function round(value) {
  return Number(value.toFixed(6));
}

function measureBatch(run, iterations) {
  const start = process.hrtime.bigint();
  let value;
  for (let index = 0; index < iterations; index += 1) value = run();
  const milliseconds = elapsedMilliseconds(start) / iterations;
  consume(value);
  return { milliseconds, value };
}

function statistics(samples) {
  const p50 = median(samples);
  const p95 = percentile(samples, 0.95);
  const mad = median(samples.map((sample) => Math.abs(sample - p50)));
  return { p50, p95, relativeMad: p50 > 0 ? mad / p50 : 0 };
}

function benchmarkAndVerify(run, protocol, expectedDigest) {
  for (let index = 0; index < protocol.warmups; index += 1) blackholeValue(run());
  const samples = [];
  let value;
  for (let index = 0; index < protocol.samples; index += 1) {
    const result = measureBatch(run, protocol.iterations);
    samples.push(result.milliseconds);
    value = result.value;
  }
  const behaviorPreserved = outputDigest(value) === expectedDigest;
  return { ...statistics(samples), samples, iterations: protocol.iterations, behaviorPreserved };
}

function createCliFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'hyv-runtime-'));
  const draftPath = join(directory, 'draft.md');
  const profilePath = join(directory, 'profile.json');
  writeFileSync(draftPath, short);
  writeFileSync(profilePath, JSON.stringify(profile));
  return { directory, draftPath, profilePath };
}

function invokeCli(cliFixture) {
  return spawnSync(process.execPath, [join(root, 'dist/cli.js'), 'analyze', cliFixture.draftPath, cliFixture.profilePath], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function benchmarkCli(cliFixture, protocol) {
  for (let index = 0; index < protocol.warmups; index += 1) blackholeValue(invokeCli(cliFixture).stdout);
  const samples = [];
  let behaviorPreserved = true;
  let stdout = '';
  for (let index = 0; index < protocol.samples; index += 1) {
    const start = process.hrtime.bigint();
    const result = invokeCli(cliFixture);
    const duration = elapsedMilliseconds(start);
    consume(result.stdout);
    samples.push(duration);
    behaviorPreserved = behaviorPreserved
      && result.status === manifest.cli.status
      && result.stderr === manifest.cli.stderr;
    stdout = result.stdout;
  }
  behaviorPreserved = behaviorPreserved && sha256(stdout) === manifest.outputs.cli_analyze_cold_short;
  return { ...statistics(samples), samples, iterations: 1, behaviorPreserved };
}

function outputDigest(value) {
  return sha256(JSON.stringify(value));
}

function expandedFixtureDigests() {
  return {
    natural: sha256(natural),
    dotted: sha256(dotted),
    short: sha256(short),
    profile: outputDigest(profile),
    fact_sources: outputDigest(factSources),
    fact_draft: sha256(factDraft),
  };
}

function observe(run, digest = outputDigest) {
  const start = process.hrtime.bigint();
  const value = run();
  const milliseconds = elapsedMilliseconds(start);
  consume(value);
  return { digest: digest(value), milliseconds };
}

function observedBehavior(cliResult) {
  const observations = {
    analyze_v3_natural_max: observe(() => pipeline.analyze(natural, profile)),
    analyze_v3_dotted_max: observe(() => pipeline.analyze(dotted, profile)),
    final_check_clean_max: observe(() => hygiene.finalOutputCheck(natural)),
    cli_analyze_cold_short: cliResult,
    fact_lint_sources_40k: observe(() => factLinter.lintFacts(factInput)),
    sentences_natural_max: observe(() => textTools.sentences(natural)),
    sentences_dotted_max: observe(() => textTools.sentences(dotted)),
    ai_editor_max: observe(() => aiEditor.analyzeAiEditor(natural, profile)),
    voice_dna_max: observe(() => voiceDna.analyzeVoiceDna(natural, profile)),
    hygiene_max: observe(() => hygiene.inspectHygiene(natural)),
  };
  return {
    outputs: Object.fromEntries(Object.entries(observations).map(([name, observation]) => [name, observation.digest])),
    timings: Object.fromEntries(Object.entries(observations).map(([name, observation]) => [name, observation.milliseconds])),
  };
}

function sameRecord(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function profileRun(scenario) {
  const runs = {
    analyze_v3_natural_max: () => pipeline.analyze(natural, profile),
    analyze_v3_dotted_max: () => pipeline.analyze(dotted, profile),
    final_check_clean_max: () => hygiene.finalOutputCheck(natural),
    fact_lint_sources_40k: () => factLinter.lintFacts(factInput),
    sentences_natural_max: () => textTools.sentences(natural),
    sentences_dotted_max: () => textTools.sentences(dotted),
    ai_editor_max: () => aiEditor.analyzeAiEditor(natural, profile),
    voice_dna_max: () => voiceDna.analyzeVoiceDna(natural, profile),
    hygiene_max: () => hygiene.inspectHygiene(natural),
  };
  const run = runs[scenario];
  if (!run) throw new Error(`Unknown profile scenario: ${scenario}`);
  const argument = process.argv.find((value) => value.startsWith('--profile-iterations='));
  if (!argument) throw new Error('Profile mode requires --profile-iterations=N.');
  const iterations = Number(argument.split('=')[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1) throw new Error('Profile iterations must be a positive integer.');
  const warmups = scenario.includes('dotted') ? 0 : Math.min(5, iterations);
  for (let index = 0; index < warmups; index += 1) blackholeValue(run());
  for (let index = 0; index < iterations; index += 1) blackholeValue(run());
  process.stdout.write(`${JSON.stringify({ scenario, iterations, blackhole })}\n`);
}

function runBenchmark() {
  const cliFixture = createCliFixture();
  try {
    if (process.argv.includes('--print-expectations')) {
      const cliBehaviorStart = process.hrtime.bigint();
      const cliBehaviorResult = invokeCli(cliFixture);
      const cliBehavior = {
        digest: sha256(cliBehaviorResult.stdout),
        milliseconds: elapsedMilliseconds(cliBehaviorStart),
      };
      const { outputs } = observedBehavior(cliBehavior);
      process.stdout.write(`${JSON.stringify({
        version: '1',
        fixturesSha256: sha256(fixtureBytes),
        expandedFixtures: expandedFixtureDigests(),
        outputs,
        cli: { status: cliBehaviorResult.status, stderr: cliBehaviorResult.stderr },
      }, null, 2)}\n`);
      return;
    }

    const fixtureIntegrity = sha256(fixtureBytes) === manifest.fixturesSha256
      && sameRecord(expandedFixtureDigests(), manifest.expandedFixtures)
      && natural.length === fixtures.natural.targetCharacters
      && dotted.length === fixtures.dotted.targetCharacters
      && short.length === fixtures.short.targetCharacters
      && factSources.reduce((total, source) => total + source.id.length + source.text.length, 0) <= 40_000;

    const cliAnalyze = benchmarkCli(cliFixture, fixtures.measurement.cliAnalyze);
    const finalCheck = benchmarkAndVerify(
      () => hygiene.finalOutputCheck(natural),
      fixtures.measurement.finalCheck,
      manifest.outputs.final_check_clean_max,
    );
    const analyzeNatural = benchmarkAndVerify(
      () => pipeline.analyze(natural, profile),
      fixtures.measurement.analyzeNatural,
      manifest.outputs.analyze_v3_natural_max,
    );
    const factLint = benchmarkAndVerify(
      () => factLinter.lintFacts(factInput),
      fixtures.measurement.factLint,
      manifest.outputs.fact_lint_sources_40k,
    );
    const sentenceNatural = benchmarkAndVerify(
      () => textTools.sentences(natural),
      fixtures.measurement.sentencesNatural,
      manifest.outputs.sentences_natural_max,
    );
    const aiEditorNatural = benchmarkAndVerify(
      () => aiEditor.analyzeAiEditor(natural, profile),
      fixtures.measurement.aiEditor,
      manifest.outputs.ai_editor_max,
    );
    const voiceDnaNatural = benchmarkAndVerify(
      () => voiceDna.analyzeVoiceDna(natural, profile),
      fixtures.measurement.voiceDna,
      manifest.outputs.voice_dna_max,
    );
    const hygieneNatural = benchmarkAndVerify(
      () => hygiene.inspectHygiene(natural),
      fixtures.measurement.hygiene,
      manifest.outputs.hygiene_max,
    );
    const analyzeDotted = benchmarkAndVerify(
      () => pipeline.analyze(dotted, profile),
      fixtures.measurement.analyzeDotted,
      manifest.outputs.analyze_v3_dotted_max,
    );
    const sentenceDotted = benchmarkAndVerify(
      () => textTools.sentences(dotted),
      fixtures.measurement.sentencesDotted,
      manifest.outputs.sentences_dotted_max,
    );
    const behaviorPreserved = [
      cliAnalyze,
      finalCheck,
      analyzeNatural,
      factLint,
      sentenceNatural,
      aiEditorNatural,
      voiceDnaNatural,
      hygieneNatural,
      analyzeDotted,
      sentenceDotted,
    ].every((scenario) => scenario.behaviorPreserved);
    const requiredNoise = [analyzeNatural.relativeMad, analyzeDotted.relativeMad, finalCheck.relativeMad, cliAnalyze.relativeMad];
    const maxRelativeMad = Math.max(...requiredNoise);

    if (typeof global.gc === 'function') global.gc();
    const result = {
      behavior_preserved: Number(behaviorPreserved),
      fixture_integrity: Number(fixtureIntegrity),
      noise_within_limit: Number(maxRelativeMad <= 0.05),
      analyze_v3_natural_max_ms: round(analyzeNatural.p50),
      analyze_v3_dotted_max_ms: round(analyzeDotted.p50),
      final_check_clean_max_ms: round(finalCheck.p50),
      cli_analyze_cold_short_ms: round(cliAnalyze.p50),
      fact_lint_sources_40k_ms: round(factLint.p50),
      analyze_v3_natural_max_p95_ms: round(analyzeNatural.p95),
      analyze_v3_dotted_max_p95_ms: round(analyzeDotted.p95),
      final_check_clean_max_p95_ms: round(finalCheck.p95),
      cli_analyze_cold_short_p95_ms: round(cliAnalyze.p95),
      sentences_natural_max_ms: round(sentenceNatural.p50),
      sentences_dotted_max_ms: round(sentenceDotted.p50),
      ai_editor_max_ms: round(aiEditorNatural.p50),
      voice_dna_max_ms: round(voiceDnaNatural.p50),
      hygiene_max_ms: round(hygieneNatural.p50),
      peak_heap_mb: round(peakHeapBytes / (1024 * 1024)),
      max_relative_mad: round(maxRelativeMad),
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    rmSync(cliFixture.directory, { recursive: true, force: true });
  }
}

const profileArgument = process.argv.find((value) => value.startsWith('--profile='));
if (process.argv.includes('--print-fixtures')) {
  process.stdout.write(`${JSON.stringify(expandedFixtureDigests(), null, 2)}\n`);
} else if (profileArgument) {
  profileRun(profileArgument.split('=')[1]);
} else {
  runBenchmark();
}

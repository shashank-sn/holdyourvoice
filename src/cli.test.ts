import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { patternsForMcp } from './mcp-tools.js';
import { canonicalJson } from './canonical-json.js';

const cli = new URL('./cli.js', import.meta.url).pathname;

function run(args: string[], env: NodeJS.ProcessEnv = process.env, input?: string) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env, input });
}

function installedContextEnvironment(root: string, context: unknown): NodeJS.ProcessEnv {
  const home = join(root, 'home');
  const config = join(home, '.config', 'holdyourvoice');
  mkdirSync(config, { recursive: true, mode: 0o700 });
  const contextPath = join(config, 'approval-context.json');
  writeFileSync(contextPath, canonicalJson(context), { mode: 0o600 });
  chmodSync(contextPath, 0o600);
  const fakeOs = join(root, 'fake-os.mjs');
  const hooks = join(root, 'hooks.mjs');
  const register = join(root, 'register.mjs');
  writeFileSync(fakeOs, `import * as actual from 'node:os'; export const userInfo = () => ({ ...actual.userInfo(), homedir: process.env.HYV_TEST_HOME });\n`);
  writeFileSync(hooks, `export async function resolve(specifier, context, nextResolve) { if (specifier === 'node:os' && context.parentURL?.endsWith('/approval-context.js')) return { url: new URL('./fake-os.mjs', import.meta.url).href, shortCircuit: true }; return nextResolve(specifier, context); }\n`);
  writeFileSync(register, `import { register } from 'node:module'; register(new URL('./hooks.mjs', import.meta.url));\n`);
  return { ...process.env, NODE_NO_WARNINGS: '1', NODE_OPTIONS: `--import=${register}`, HYV_TEST_HOME: home };
}

test('creates an explicit local avoid list and exposes the ruleset', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const first = join(directory, 'first.md');
    const second = join(directory, 'second.md');
    const profile = join(directory, 'profile.json');
    writeFileSync(first, 'i write plainly. i name the work.');
    writeFileSync(second, 'i keep the mechanism clear. i avoid filler.');
    const created = run(['profile', profile, first, second, '--avoid=unlock']);
    assert.equal(created.status, 0, created.stderr);
    assert.deepEqual(JSON.parse(readFileSync(profile, 'utf8')).avoid, ['unlock']);

    const patterns = run(['patterns']);
    assert.equal(patterns.status, 0, patterns.stderr);
    assert.ok(JSON.parse(patterns.stdout).rules.every((rule: { id: string; severity: string; reason: string; suggestion: string }) => rule.id && rule.severity && rule.reason && rule.suggestion));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('publishes the same normalized reconciled catalog and version through CLI and MCP', () => {
  const result = run(['patterns']);
  assert.equal(result.status, 0, result.stderr);
  const cliCatalog = JSON.parse(result.stdout);
  const mcpCatalog = patternsForMcp();
  assert.equal(cliCatalog.version, '3.2.0-reconciled.1');
  assert.equal(cliCatalog.rules.length, 148);
  assert.deepEqual(cliCatalog, mcpCatalog);
});

test('runs contextual analysis and batch analysis without changing the profile contract', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const first = join(directory, 'first.md'); const second = join(directory, 'second.md'); const profile = join(directory, 'profile.json');
    const brief = join(directory, 'brief.json'); const draft = join(directory, 'draft.md'); const duplicate = join(directory, 'duplicate.md'); const task = join(directory, 'task.json');
    writeFileSync(first, 'I write plainly. I name the work.'); writeFileSync(second, 'I keep the mechanism clear. I avoid filler.');
    writeFileSync(brief, JSON.stringify({ version: '1', audience: 'founders', intent: 'start a discussion', format: 'social' }));
    writeFileSync(draft, 'A pattern I keep seeing in founder posts is vague advice.'); writeFileSync(duplicate, 'A pattern I keep seeing in founder posts is vague advice.');
    assert.equal(run(['profile', profile, first, second]).status, 0);
    const contextual = JSON.parse(run(['analyze', draft, profile, brief]).stdout);
    assert.equal(contextual.editorial.findings[0].id, 'editorial.social.generic-opener');
    assert.equal(contextual.hygiene.suspiciousCount, 0);
    const batch = JSON.parse(run(['batch-analyze', draft, duplicate]).stdout);
    assert.equal(batch.findings.length, 2);
    assert.equal(run(['prepare-rewrite', draft, profile, task, brief]).status, 0);
    assert.equal(JSON.parse(readFileSync(task, 'utf8')).writingBrief.format, 'social');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('inspects and conservatively fixes Unicode hygiene without overwriting either file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const draft = join(directory, 'draft.md');
    const cleaned = join(directory, 'draft.cleaned.md');
    const original = `\uFEFFkeep\u200Bthis\u00A0space\u200D`;
    writeFileSync(draft, original);

    const inspected = run(['hygiene', draft]);
    assert.equal(inspected.status, 0, inspected.stderr);
    const report = JSON.parse(inspected.stdout);
    assert.equal(report.suspiciousCount, 4);
    assert.equal(report.fixableCount, 1);

    const fixed = run(['hygiene', draft, '--fix']);
    assert.equal(fixed.status, 0, fixed.stderr);
    const receipt = JSON.parse(fixed.stdout);
    assert.equal(receipt.outputPath, cleaned);
    assert.equal(receipt.changed, true);
    assert.equal(receipt.changes.length, 1);
    assert.equal(readFileSync(draft, 'utf8'), original);
    assert.equal(readFileSync(cleaned, 'utf8'), `keep\u200Bthis\u00A0space\u200D`);

    const custom = join(directory, 'review-copy.md');
    const customFixed = run(['hygiene', draft, '--fix', `--output=${custom}`]);
    assert.equal(customFixed.status, 0, customFixed.stderr);
    assert.equal(JSON.parse(customFixed.stdout).outputPath, custom);
    assert.equal(readFileSync(custom, 'utf8'), `keep\u200Bthis\u00A0space\u200D`);

    const samePath = run(['hygiene', draft, '--fix', `--output=${draft}`]);
    assert.equal(samePath.status, 1);
    assert.match(samePath.stderr, /must differ from the input path/);
    assert.equal(readFileSync(draft, 'utf8'), original);

    const refused = run(['hygiene', draft, '--fix']);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /already exists/);
    assert.equal(readdirSync(directory).some((name) => name.startsWith('.hyv-hygiene-')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('inspects stdin and refuses to clean it without a preservable input file', () => {
  const inspected = run(['hygiene', '-'], process.env, 'one\u200Btwo');
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.equal(JSON.parse(inspected.stdout).suspiciousCount, 1);

  const refused = run(['hygiene', '-', '--fix'], process.env, 'one\u200Btwo');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /requires a file path/);
});

test('gates final output from any producer without a voice profile', () => {
  const clean = run(['final-check', '-'], process.env, 'exact output\n');
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stdout, 'exact output\n');
  assert.equal(clean.stderr, '');

  const bom = run(['final-check', '-'], process.env, '\uFEFFexact output');
  assert.equal(bom.status, 0, bom.stderr);
  assert.equal(bom.stdout, 'exact output');
  assert.match(bom.stderr, /U\+FEFF/);

  const unresolved = run(['final-check', '-'], process.env, 'Thai\u200Bboundary');
  assert.equal(unresolved.status, 2);
  assert.equal(unresolved.stdout, '');
  assert.match(unresolved.stderr, /U\+200B/);
});

test('uses exit code 2 for a failed candidate gate and 1 for misuse', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const first = join(directory, 'first.md');
    const second = join(directory, 'second.md');
    const profile = join(directory, 'profile.json');
    const original = join(directory, 'original.md');
    const candidate = join(directory, 'candidate.md');
    writeFileSync(first, 'i write plainly. i name the work.');
    writeFileSync(second, 'i keep the mechanism clear. i avoid filler.');
    writeFileSync(original, 'i name the work.');
    writeFileSync(candidate, 'i unlock the answer.');
    assert.equal(run(['profile', profile, first, second, '--avoid=unlock']).status, 0);
    const verification = run(['verify', original, candidate, profile]);
    assert.equal(verification.status, 2);
    assert.deepEqual(Object.keys(JSON.parse(verification.stdout)).sort(), ['candidate', 'original', 'passed', 'preservationScore', 'regressions', 'version']);
    assert.equal(run(['unknown-command']).status, 1);
    assert.equal(run(['mcp', 'unexpected']).status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('fails the CopySpec gate when a locked claim changes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const first = join(directory, 'first.md'); const second = join(directory, 'second.md'); const profile = join(directory, 'profile.json');
    const original = join(directory, 'original.md'); const candidate = join(directory, 'candidate.md'); const spec = join(directory, 'copy-spec.json');
    writeFileSync(first, 'I write plainly. I name the work.'); writeFileSync(second, 'I keep the mechanism clear. I avoid filler.');
    writeFileSync(original, 'The launch is on 14 August.'); writeFileSync(candidate, 'The launch is next month.');
    writeFileSync(spec, JSON.stringify({ version: '1', audience: 'operators', intent: 'explain', channel: 'email', claims: [{ id: 'launch-date', text: 'The launch is on 14 August.', evidence: 'Release calendar.' }] }));
    assert.equal(run(['profile', profile, first, second]).status, 0);
    const result = run(['verify-spec', original, candidate, profile, spec]);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).claims.failures[0].code, 'missing_immutable_claim');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('prepares and applies the same constrained rewrite task without a provider call', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const first = join(directory, 'first.md'); const second = join(directory, 'second.md'); const profile = join(directory, 'profile.json');
    const draft = join(directory, 'draft.md'); const task = join(directory, 'task.json'); const response = join(directory, 'response.json');
    writeFileSync(first, 'I write plainly. I name the work.'); writeFileSync(second, 'I keep the mechanism clear. I avoid filler.');
    writeFileSync(draft, 'I leverage the answer with useful detail and clear mechanism.');
    assert.equal(run(['profile', profile, first, second, '--avoid=leverage']).status, 0);
    assert.equal(run(['prepare-rewrite', draft, profile, task]).status, 0);
    const prepared = JSON.parse(readFileSync(task, 'utf8'));
    writeFileSync(response, JSON.stringify({ version: '1', taskFingerprint: prepared.fingerprint, replacements: [{ sentenceId: 1, text: 'I use the answer with useful detail and clear mechanism.' }] }));
    const result = run(['apply-rewrite', task, response, profile]);
    assert.equal(result.status, 2, result.stderr);
    const applied = JSON.parse(result.stdout);
    assert.equal(applied.status, 'needs_semantic_review');
    assert.equal(applied.candidate, 'I use the answer with useful detail and clear mechanism.');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('prepares and reduces pre-edit judgment envelopes through CLI', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-judgment-'));
  try {
    const first = join(directory, 'first.md'); const second = join(directory, 'second.md'); const profile = join(directory, 'profile.json');
    const draft = join(directory, 'draft.md');
    writeFileSync(first, 'I write plainly. I name the work.'); writeFileSync(second, 'I keep the mechanism clear. I avoid filler.');
    writeFileSync(draft, 'I leverage the answer.');
    assert.equal(run(['profile', profile, first, second, '--avoid=leverage']).status, 0);
    const envelopes = (['triage', 'argument', 'form'] as const).map((kind) => {
      const taskPath = join(directory, `${kind}.json`);
      assert.equal(run(['prepare-judgment', 'pre-edit', kind, draft, profile, taskPath]).status, 0);
      const task = JSON.parse(readFileSync(taskPath, 'utf8'));
      const envelopePath = join(directory, `${kind}-envelope.json`);
      writeFileSync(envelopePath, JSON.stringify({
        version: '1', stage: 'pre-edit', judgmentType: kind, taskFingerprint: task.taskFingerprint,
        bindings: { ...task.bindings, evaluatorId: 'writer.1' }, findings: [], decision: 'SHIP',
      }));
      return envelopePath;
    });
    const result = run(['reduce-judgment', ...envelopes]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).decision, 'SHIP');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('prepares, submits, and inspects a normal lifecycle through CLI canonical envelopes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-lifecycle-'));
  try {
    const deterministicBase = { version: '1', verificationKind: 'standard', passed: true, analysisVersion: '2', rulesetVersion: '3.2.0', preservationMetricVersion: 'legacy-set-v1', preservationScore: 100, sourceHash: '4'.repeat(64), candidateHash: '5'.repeat(64), profileId: 'founder.primary', profileRevisionDigest: '6'.repeat(64), regressionKeys: [] };
    const deterministic = { ...deterministicBase, artifactFingerprint: createHash('sha256').update(`hyv:deterministic-verification:v1\0${canonicalJson(deterministicBase)}`).digest('hex') };
    const binding = { rewriteTaskFingerprint: '1'.repeat(64), rewriteResponseFingerprint: '2'.repeat(64), deterministicArtifactFingerprint: deterministic.artifactFingerprint, sourceHash: deterministic.sourceHash, candidateHash: deterministic.candidateHash, profileId: deterministic.profileId, profileRevisionDigest: deterministic.profileRevisionDigest, rulesetVersion: deterministic.rulesetVersion, schemaVersion: '1' };
    const receipt = { version: '1', taskFingerprint: binding.rewriteTaskFingerprint, responseFingerprint: binding.rewriteResponseFingerprint, adapterIds: [], replacementSentenceIds: [1] };
    const paths = Object.fromEntries(['deterministic', 'binding', 'receipt', 'violations', 'output', 'artifact', 'task', 'verdict'].map((name) => [name, join(directory, `${name}.json`)]));
    writeFileSync(paths.deterministic, JSON.stringify(deterministic)); writeFileSync(paths.binding, JSON.stringify(binding)); writeFileSync(paths.receipt, JSON.stringify(receipt)); writeFileSync(paths.violations, JSON.stringify(['action_change']));
    const prepared = run(['lifecycle', 'prepare-semantic', paths.deterministic, paths.binding, paths.receipt, 'normal', paths.violations, paths.output]);
    assert.equal(prepared.status, 0, prepared.stderr); const envelope = JSON.parse(prepared.stdout); assert.equal(envelope.artifact.status, 'needs_semantic_review');
    assert.deepEqual(JSON.parse(readFileSync(paths.output, 'utf8')), envelope);
    writeFileSync(paths.artifact, JSON.stringify(envelope.artifact)); writeFileSync(paths.task, JSON.stringify(envelope.task)); writeFileSync(paths.verdict, JSON.stringify({ approved: true, violations: [] }));
    const context = { now: 0, trustStore: { version: '1', audience: '@holdyourvoice/hyv', maxCapabilityLifetimeSeconds: 300, keys: [] }, authorizedSemanticEvaluatorIds: { normal: ['reviewer-1'], highAssurance: [] }, authorizedHumanFinalizerIds: ['human-1'] };
    const submitted = run(['lifecycle', 'submit-verdict', paths.artifact, paths.task, 'reviewer-1', paths.verdict], installedContextEnvironment(directory, context));
    assert.equal(submitted.status, 0, submitted.stderr); assert.equal(JSON.parse(submitted.stdout).status, 'ready_for_human_review');
    const inspected = run(['lifecycle', 'inspect', paths.artifact]); assert.equal(inspected.status, 0, inspected.stderr); assert.equal(JSON.parse(inspected.stdout).status, 'needs_semantic_review');
    assert.doesNotMatch(inspected.stdout, /sourceHash|candidateHash|verdicts/);
    assert.equal(run(['lifecycle', 'prepare-semantic', paths.deterministic, paths.binding, paths.receipt, 'high_assurance', paths.violations, join(directory, 'high.json')]).status, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('accepts only one bounded capability transport and treats a file named stdin literally', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-capability-'));
  try {
    const capability = JSON.stringify({ payload: 'secret-payload', signature: 'secret-signature' });
    const literal = join(directory, 'stdin');
    writeFileSync(literal, capability, { mode: 0o600 });
    const literalResult = spawnSync(process.execPath, [cli, 'lifecycle', 'validate-final-approval', 'missing.json', '--capability-file', 'stdin'], { cwd: directory, encoding: 'utf8' });
    assert.equal(literalResult.status, 1);
    assert.doesNotMatch(literalResult.stderr, /Capability file is unavailable or unsafe|secret-payload|secret-signature/);

    chmodSync(literal, 0o644);
    const unsafe = spawnSync(process.execPath, [cli, 'lifecycle', 'validate-final-approval', 'missing.json', '--capability-file', 'stdin'], { cwd: directory, encoding: 'utf8' });
    assert.equal(unsafe.status, 1);
    assert.match(unsafe.stderr, /Capability file is unavailable or unsafe/);
    assert.doesNotMatch(unsafe.stderr, /secret-payload|secret-signature/);

    const duplicate = run(['lifecycle', 'validate-final-approval', 'missing.json', '--capability-stdin', '--capability-file', literal], process.env, capability);
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /Choose one capability source/);
    assert.doesNotMatch(duplicate.stderr, /secret-payload|secret-signature/);

    const oversized = run(['lifecycle', 'validate-final-approval', 'missing.json', '--capability-stdin'], process.env, 'x'.repeat(1024 * 1024 + 1));
    assert.equal(oversized.status, 1);
    assert.match(oversized.stderr, /exceeds the byte limit/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('rejects a malformed hand-edited profile before analysis', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const draft = join(directory, 'draft.md');
    const profile = join(directory, 'profile.json');
    writeFileSync(draft, 'i name the work.');
    writeFileSync(profile, JSON.stringify({ version: '2', sampleCount: 2, metrics: {}, avoid: [1] }));
    const result = run(['analyze', draft, profile]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a valid Hold Your Voice version 2 profile/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects malformed profile enum values and punctuation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const draft = join(directory, 'draft.md');
    const profile = join(directory, 'profile.json');
    writeFileSync(draft, 'i name the work.');
    writeFileSync(profile, JSON.stringify({
      version: '2',
      sampleCount: 2,
      metrics: {
        sentenceLength: 4,
        sentenceVariation: 1,
        sentenceStructure: [],
        rhythm: 1,
        paragraphLength: 1,
        openingMoves: [],
        vocabulary: [],
        lexicalDensity: 0.5,
        pointOfView: 'fourth_person',
        punctuation: [],
        caseStyle: 'titlecase',
        questionRate: 0,
        transitions: [],
      },
      avoid: [''],
    }));
    assert.equal(run(['analyze', draft, profile]).status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects hand-edited metrics outside their semantic bounds', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const first = join(directory, 'first.md');
    const second = join(directory, 'second.md');
    const profile = join(directory, 'profile.json');
    const draft = join(directory, 'draft.md');
    writeFileSync(first, 'i write plainly.');
    writeFileSync(second, 'i name the work.');
    writeFileSync(draft, 'i name the work.');
    assert.equal(run(['profile', profile, first, second]).status, 0);
    const malformed = JSON.parse(readFileSync(profile, 'utf8'));
    malformed.sampleCount = 2.5;
    malformed.metrics.questionRate = 1.2;
    writeFileSync(profile, JSON.stringify(malformed));
    assert.equal(run(['analyze', draft, profile]).status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('keeps verification read-only and exposes learning only through explicit controls', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-'));
  try {
    const first = join(directory, 'first.md');
    const second = join(directory, 'second.md');
    const profile = join(directory, 'profile.json');
    const original = join(directory, 'original.md');
    const candidate = join(directory, 'candidate.md');
    const env = { ...process.env, HYV_HOME: join(directory, 'state') };
    writeFileSync(first, 'I write plainly. I name the work.');
    writeFileSync(second, 'I keep the mechanism clear. I avoid filler.');
    writeFileSync(original, 'I leverage the answer with useful detail and clear mechanism.');
    writeFileSync(candidate, 'I use the answer with useful detail and clear mechanism.');
    assert.equal(run(['profile', profile, first, second, '--avoid=leverage'], env).status, 0);
    assert.equal(run(['verify', original, candidate, profile], env).status, 0);
    const brief = run(['rewrite-prompt', candidate, profile], env);
    assert.equal(brief.status, 0, brief.stderr);
    assert.doesNotMatch(brief.stdout, /Learned local preferences/);
    const learned = run(['learning', 'show', profile], env);
    assert.equal(learned.status, 0, learned.stderr);
    assert.deepEqual(JSON.parse(learned.stdout).preferences, []);
    assert.equal(run(['learning', 'clear', profile], env).status, 0);
    assert.deepEqual(JSON.parse(run(['learning', 'show', profile], env).stdout).preferences, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('records and inspects text-free learning metadata through the CLI', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-learning-'));
  try {
    const first = join(directory, 'first.md'); const second = join(directory, 'second.md'); const profile = join(directory, 'profile.json');
    const env = { ...process.env, HYV_HOME: join(directory, 'state') };
    writeFileSync(first, 'I write plainly. I name the work.'); writeFileSync(second, 'I keep the mechanism clear. I avoid filler.');
    assert.equal(run(['profile', profile, first, second]).status, 0);
    const recorded = run(['learning', 'record', profile, 'Keep the mechanism concrete.', '--authority=founder', '--provenance=editor-review', '--weight=2', '--compatibility=exact', '--mutation-id=cli-1'], env);
    assert.equal(recorded.status, 0, recorded.stderr);
    assert.equal(JSON.parse(recorded.stdout).mutationId, 'cli-1');
    assert.equal(JSON.parse(run(['learning', 'record', profile, 'Different instruction.', '--mutation-id=cli-1'], env).stdout).status, 'conflict');
    const inspected = run(['learning', 'inspect', profile], env);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(JSON.parse(inspected.stdout)[0].authority, 'founder');
    assert.doesNotMatch(inspected.stdout, /Keep the mechanism concrete/);
    assert.equal(run(['learning', 'ratify', profile, JSON.parse(recorded.stdout).eventId], env).status, 1);
    assert.equal(run(['learning', 'record', profile, 'Boundary.', `--mutation-id=${'m'.repeat(200)}`, `--provenance=${'p'.repeat(500)}`], env).status, 0);
    assert.equal(run(['learning', 'record', profile, 'Too long.', `--mutation-id=${'m'.repeat(201)}`], env).status, 1);
    assert.equal(run(['learning', 'record', profile, 'Too long.', `--provenance=${'p'.repeat(501)}`], env).status, 1);
    assert.equal(run(['learning', 'inspect', profile, '--mutation-id=nope'], env).status, 1);
    assert.equal(run(['learning', 'clear', profile, '--authority=team'], env).status, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('prepares and applies an authorized rebuild through CLI', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdyourvoice-cli-rebuild-'));
  try {
    const first = join(directory, 'first.md'); const second = join(directory, 'second.md'); const profile = join(directory, 'profile.json');
    const draft = join(directory, 'draft.md'); const spec = join(directory, 'copy-spec.json');
    const reduction = join(directory, 'reduction.json'); const task = join(directory, 'rebuild-task.json');
    const response = join(directory, 'response.json'); const capability = join(directory, 'capability.json');
    writeFileSync(first, 'I write plainly. I name the work.'); writeFileSync(second, 'I keep the mechanism clear. I avoid filler.');
    writeFileSync(draft, 'I leverage the answer. The launch is on 14 August.');
    writeFileSync(spec, JSON.stringify({ version: '1', audience: 'operators', intent: 'explain', channel: 'email', claims: [{ id: 'launch-date', text: 'The launch is on 14 August.', evidence: 'Release calendar, 7 August.' }] }));
    assert.equal(run(['profile', profile, first, second, '--avoid=leverage']).status, 0);
    const envelopes = (['triage', 'argument', 'form'] as const).map((kind) => {
      const taskPath = join(directory, `${kind}.json`);
      assert.equal(run(['prepare-judgment', 'pre-edit', kind, draft, profile, taskPath]).status, 0);
      const prepared = JSON.parse(readFileSync(taskPath, 'utf8'));
      const envelopePath = join(directory, `${kind}-envelope.json`);
      writeFileSync(envelopePath, JSON.stringify({
        version: '1', stage: 'pre-edit', judgmentType: kind, taskFingerprint: prepared.taskFingerprint,
        bindings: { ...prepared.bindings, evaluatorId: 'writer.1' }, findings: [], decision: kind === 'argument' ? 'REBUILD' : 'SHIP',
      }));
      return envelopePath;
    });
    const reduced = run(['reduce-judgment', ...envelopes]);
    assert.equal(reduced.status, 0, reduced.stderr);
    writeFileSync(reduction, reduced.stdout);
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const trustStore = { version: '1', audience: '@holdyourvoice/hyv', maxCapabilityLifetimeSeconds: 300, keys: [{ issuer: 'host.example', keyId: 'key-1', publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'), status: 'active' }] };
    const context = { now: 0, trustStore, authorizedSemanticEvaluatorIds: { normal: [], highAssurance: [] }, authorizedHumanFinalizerIds: [] };
    const env = installedContextEnvironment(directory, context);
    const sourceHash = createHash('sha256').update(readFileSync(draft)).digest('hex');
    const profileValue = JSON.parse(readFileSync(profile, 'utf8'));
    const identity = `legacy-v2:${createHash('sha256').update(canonicalJson(profileValue)).digest('hex')}`;
    const claims = {
      version: '1', purpose: 'hyv.rebuild-authorization', issuer: 'host.example', audience: '@holdyourvoice/hyv',
      subjectArtifactFingerprint: JSON.parse(reduced.stdout).recommendationFingerprint, sourceHash, candidateHash: sourceHash,
      profileId: identity, profileRevisionDigest: identity, keyId: 'key-1', issuedAt: Math.floor(Date.now() / 1000) - 1,
      notBefore: Math.floor(Date.now() / 1000) - 1, expiresAt: Math.floor(Date.now() / 1000) + 120, nonce: 'cli-rebuild',
    };
    const payload = Buffer.from(canonicalJson(claims));
    writeFileSync(capability, canonicalJson({ payload: payload.toString('base64url'), signature: sign(null, payload, privateKey).toString('base64url') }));
    chmodSync(capability, 0o600);
    const prepared = run(['prepare-rebuild', draft, profile, reduction, spec, task, '--capability-file', capability], env);
    assert.equal(prepared.status, 0, prepared.stderr);
    writeFileSync(response, JSON.stringify({
      version: '1', mode: 'REBUILD', taskFingerprint: JSON.parse(readFileSync(task, 'utf8')).fingerprint,
      candidate: 'Ship planning now treats one calendar fact as fixed. The launch is on 14 August. Every other sentence in this note is new operational language for the release desk.',
    }));
    const applied = run(['apply-rebuild', task, response, profile, '--capability-file', capability], env);
    assert.equal(applied.status, 2, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).status, 'needs_semantic_review');
    assert.equal(run(['apply-rebuild', task, response, profile], env).status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

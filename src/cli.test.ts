import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { patternsForMcp } from './mcp-tools.js';

const cli = new URL('./cli.js', import.meta.url).pathname;

function run(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });
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

test('publishes the same normalized 145-rule catalog and version through CLI and MCP', () => {
  const result = run(['patterns']);
  assert.equal(result.status, 0, result.stderr);
  const cliCatalog = JSON.parse(result.stdout);
  const mcpCatalog = patternsForMcp();
  assert.equal(cliCatalog.version, '2.9.24-static.2');
  assert.equal(cliCatalog.rules.length, 145);
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
    const batch = JSON.parse(run(['batch-analyze', draft, duplicate]).stdout);
    assert.equal(batch.findings.length, 2);
    assert.equal(run(['prepare-rewrite', draft, profile, task, brief]).status, 0);
    assert.equal(JSON.parse(readFileSync(task, 'utf8')).writingBrief.format, 'social');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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

test('learns from a successful local verification by default and exposes local controls', () => {
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
    assert.match(brief.stdout, /Learned local preferences/);
    assert.match(brief.stdout, /ai\\_editor\/ai\.leverage/);
    const learned = run(['learning', 'show', profile], env);
    assert.equal(learned.status, 0, learned.stderr);
    assert.ok(JSON.parse(learned.stdout).preferences.some((item: { text: string }) => item.text.includes('ai_editor/ai.leverage')));
    assert.equal(run(['learning', 'clear', profile], env).status, 0);
    assert.deepEqual(JSON.parse(run(['learning', 'show', profile], env).stdout).preferences, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

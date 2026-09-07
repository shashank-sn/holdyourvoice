import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, symlinkSync, realpathSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) {
    console.error('Usage: node scripts/verify-compatibility.mjs <built-baseline> [built-candidate] [report.json]');
    process.exit(1);
}
const baselineSource = resolve(process.argv[2]);
let baseline = baselineSource;
const candidate = resolve(process.argv[3] ?? root);
const reportPath = process.argv[4] ? resolve(process.argv[4]) : undefined;
const temp = mkdtempSync(join(tmpdir(), 'hyv-contract-'));
process.env.HYV_HOME = join(temp, 'state');
const RealDate = Date;
globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-09-07T00:00:00.000Z'])); }
    static now() { return 1788739200000; }
};
const failures = [], counts = {}, cache = new Map(), additions = {};
function check(group, label, expected, actual) {
    counts[group] = (counts[group] ?? 0) + 1;
    if (expected !== actual)
        failures.push({ group, label, expected, actual });
}
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]); }
function distDigest(repo) { const hash = createHash('sha256'); for (const path of walk(join(repo, 'dist')).sort()) {
    hash.update(relative(repo, path));
    hash.update(readFileSync(path));
} return hash.digest('hex'); }
const inputDigests = { baseline: distDigest(baselineSource), candidate: distDigest(candidate) };
let versionAlignment;
async function mod(repo, name) {
    const key = join(repo, 'dist', `${name}.js`);
    if (!cache.has(key))
        cache.set(key, await import(pathToFileURL(key)));
    return cache.get(key);
}
async function call(repo, name, fn, args) {
    try {
        return JSON.stringify({ ok: await (await mod(repo, name))[fn](...args) });
    }
    catch (e) {
        return JSON.stringify({ error: { name: e.name, message: e.message } });
    }
}
async function compare(name, fn, args, label = '') {
    for (const repo of [baseline, candidate]) {
        if (typeof (await mod(repo, name))[fn] !== 'function')
            throw new Error(`Missing function: ${repo}/dist/${name}.js:${fn}`);
    }
    check('functions', `${name}.${fn}:${label}`, await call(baseline, name, fn, structuredClone(args)), await call(candidate, name, fn, structuredClone(args)));
}
function cli(repo, args, input) {
    const result = spawnSync(process.execPath, [join(repo, 'dist/cli.js'), ...args], { cwd: temp, env: process.env, input, encoding: 'utf8', timeout: 15000 });
    return JSON.stringify({ status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, error: result.error?.code });
}
async function mcp(repo, redaction) {
    const child = spawn(process.execPath, [join(repo, 'dist/cli.js'), 'mcp'], { cwd: temp, env: { ...process.env, HYV_MCP_SENSITIVE_INPUT_REDACTION: redaction }, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', stderr = '';
    const pending = new Map();
    let id = 0;
    child.stderr.on('data', x => stderr += x);
    child.stdout.on('data', data => { buffer += data; let newline; while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
            const response = JSON.parse(line);
            pending.get(response.id)?.(response);
            pending.delete(response.id);
        }
        catch { }
    } });
    function request(method, params = {}) {
        return new Promise((res, rej) => { const n = ++id; const timer = setTimeout(() => rej(new Error(`mcp timeout: ${method}; ${stderr}`)), 15000); pending.set(n, value => { clearTimeout(timer); res(value); }); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`); });
    }
    try {
        const initialized = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'compatibility', version: '1' } });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
        const list = await request('tools/list');
        const replies = [initialized, list];
        for (const tool of list.result.tools)
            replies.push(await request('tools/call', { name: tool.name, arguments: {} }));
        for (const args of [{ name: 'hyv_final_check', arguments: { text: '\uFEFFclean text' } }, { name: 'hyv_final_check', arguments: { text: 'bad\u200Btext' } }, { name: 'hyv_analyze', arguments: { draft: 'text', profile_json: '{' } }, { name: 'hyv_hygiene', arguments: { draft: '' } }])
            replies.push(await request('tools/call', args));
        return JSON.stringify(replies);
    }
    finally {
        child.kill();
    }
}
function alignBaselineVersion() {
    const before = readFileSync(join(baselineSource, 'dist/version.js'), 'utf8');
    const after = readFileSync(join(candidate, 'dist/version.js'), 'utf8');
    const versionLiteral = /^export const HYV_VERSION = (['"])([^'"\r\n]+)\1;\s*$/;
    const sourceVersion = before.match(versionLiteral)?.[2];
    const targetVersion = after.match(versionLiteral)?.[2];
    if (!sourceVersion || !targetVersion) throw new Error('Version alignment requires a single literal HYV_VERSION export.');
    if (sourceVersion === targetVersion) return;
    baseline = join(temp, 'baseline');
    cpSync(join(baselineSource, 'dist'), join(baseline, 'dist'), { recursive: true });
    cpSync(join(baselineSource, 'skills'), join(baseline, 'skills'), { recursive: true });
    writeFileSync(join(baseline, 'package.json'), '{"type":"module"}\n');
    symlinkSync(realpathSync(join(baselineSource, 'node_modules')), join(baseline, 'node_modules'), 'dir');
    writeFileSync(join(baseline, 'dist/version.js'), after);
    versionAlignment = {
        sourceVersion, targetVersion, changedModule: 'dist/version.js',
        originalModuleSha256: createHash('sha256').update(before).digest('hex'),
        alignedModuleSha256: createHash('sha256').update(after).digest('hex'),
        alignedBuildSha256: distDigest(baseline),
    };
}

try {
    alignBaselineVersion();
    const paths = walk(join(baseline, 'dist')).filter(p => p.endsWith('.js') && !p.endsWith('.test.js')).map(p => relative(join(baseline, 'dist'), p)).sort();
    const candidatePaths = new Set(walk(join(candidate, 'dist')).map(p => relative(join(candidate, 'dist'), p)));
    for (const path of paths) {
        check('paths', path, true, candidatePaths.has(path));
        if (['cli.js', 'mcp.js'].includes(path))
            continue;
        const a = await mod(baseline, path.slice(0, -3)), b = await mod(candidate, path.slice(0, -3));
        check('exports', path, JSON.stringify(Object.keys(a).map(k => [k, typeof a[k]])), JSON.stringify(Object.keys(a).map(k => [k, typeof b[k]])));
        additions[path] = Object.keys(b).filter(key => !(key in a));
        for (const key of Object.keys(a))
            if (typeof a[key] !== 'function')
                check('constants', `${path}:${key}`, JSON.stringify(a[key], (_k, v) => v instanceof Set ? [...v] : v), JSON.stringify(b[key], (_k, v) => v instanceof Set ? [...v] : v));
    }
    const texts = new Set(['', ' ', 'plain words.', 'we can ship this. we should test it first.', '\uFEFFclean', 'a\u200Bb\u202Ec', 'a\u00A0b', 'emoji 😀. café. café.', '# heading\r\n\r\n- list item\r\n', '```js\nconst x = 1;\n```\n\nvisit https://example.com/a.', 'the secret: it unlocks seamless growth.']);
    function harvest(value) { if (typeof value === 'string' && value.length >= 12 && value.length < 20000)
        texts.add(value);
    else if (Array.isArray(value))
        value.forEach(harvest);
    else if (value && typeof value === 'object')
        Object.values(value).forEach(harvest); }
    for (const folder of ['fixtures', 'test-fixtures'])
        for (const path of walk(join(baselineSource, folder)).filter(p => p.endsWith('.json')))
            harvest(JSON.parse(readFileSync(path, 'utf8')));
    const samples = ['i write plainly. i name the work. the team can ship after the tests pass.', 'i keep the mechanism clear. the owner checks the evidence. the next step stays small.'];
    const voice = await mod(baseline, 'voice-dna');
    const profiles = [voice.buildProfile(samples), voice.buildProfileV3(samples, 'test.general', 'general')];
    for (const channel of ['general', 'email', 'chat', 'long-form', 'social', 'docs'])
        await compare('voice-dna', 'buildProfileV3', [samples, `test.${channel}`, channel]);
    await compare('voice-dna', 'buildProfile', [samples]);
    await compare('ai-editor', 'serializedRules', []);
    let index = 0;
    for (const text of texts) {
        for (const [name, fns] of Object.entries({ text: ['words', 'sentences', 'paragraphs'], 'ai-editor': ['maskNonProse', 'analyzeAiEditor'], 'voice-dna': ['profileMetrics', 'measureFounderFingerprint'], hygiene: ['inspectHygiene', 'hygieneSourceFindings', 'cleanHygiene', 'finalOutputCheck'], 'hidden-text': ['inspectHiddenText', 'applyHiddenTextPolicy'], 'fact-linter': ['extractFactClaims'], 'logic-linter': ['lintLogic'], 'delivery-integrity': ['inspectDeliveryIntegrity'] }))
            for (const fn of fns)
                await compare(name, fn, [text], index);
        for (const profile of profiles) {
            for (const fn of ['analyze', 'rewritePrompt'])
                await compare('pipeline', fn, [text, profile], index);
            await compare('pipeline', 'verify', [text, text, profile], index);
            await compare('pipeline', 'verify', [text, `${text} New unsupported claim.`, profile], index);
            await compare('rewrite-task', 'prepareRewriteTask', [text, profile], index);
        }
        await compare('preservation', 'comparePreservation', [text, `${text} Extra words.`], index);
        if (++index % 25 === 0)
            process.stdout.write(`corpus ${index}/${texts.size}\n`);
    }
    for (const [name, fn] of [['profile', 'parseProfile'], ['copy-spec', 'parseCopySpec'], ['editorial-packs', 'parseWritingBrief'], ['hidden-text', 'parseHiddenTextPolicy'], ['judgment-task', 'parseJudgmentEnvelope'], ['rewrite-task', 'parseRewriteTask'], ['recomposition', 'parseRecompositionPolicy'], ['team-profile', 'parseTeamProfileBundle'], ['delivery-integrity', 'parseDeliveryIntegrityPolicy'], ['disposition', 'parseSurfacePolicy']])
        for (const value of [null, {}, [], '', { version: '999' }, { version: '1' }])
            await compare(name, fn, [value], JSON.stringify(value));
    for (const value of [null, {}, [], { z: [1, true, null], a: 'é' }, 0, -0, Infinity, NaN])
        await compare('canonical-json', 'canonicalJson', [value]);
    const profilePath = join(temp, 'profile.json'), textPath = join(temp, 'draft.md');
    writeFileSync(profilePath, JSON.stringify(profiles[0]));
    writeFileSync(textPath, 'the secret: it unlocks seamless growth.');
    const commands = [...readFileSync(join(baselineSource, 'src/cli.ts'), 'utf8').matchAll(/^  (?:'([^']+)'|(\w+)): run/gm)].map(m => m[1] ?? m[2]);
    for (const command of ['', ...commands.filter(c => c !== 'mcp'), 'unknown-command'])
        check('cli', `usage:${command}`, cli(baseline, command ? [command] : []), cli(candidate, command ? [command] : []));
    for (const args of [['patterns'], ['agent', 'list'], ['agent', 'validate'], ['analyze', textPath, profilePath], ['verify', textPath, textPath, profilePath], ['rewrite-prompt', textPath, profilePath], ['prepare-rewrite', textPath, profilePath], ['hygiene', textPath], ['logic-lint', textPath], ['dispositions', textPath, profilePath], ['final-check', '-'], ['delivery-check', '-']])
        check('cli', args[0], cli(baseline, args, 'a\u200Bb'), cli(candidate, args, 'a\u200Bb'));
    for (const mode of ['', '1'])
        check('mcp', `redaction:${mode}`, await mcp(baseline, mode), await mcp(candidate, mode));
    check('input-stability', 'baseline dist unchanged during run', inputDigests.baseline, distDigest(baselineSource));
    if (versionAlignment) check('input-stability', 'aligned baseline unchanged during run', versionAlignment.alignedBuildSha256, distDigest(baseline));
    check('input-stability', 'candidate dist unchanged during run', inputDigests.candidate, distDigest(candidate));
    const report = { baseline: baselineSource, candidate, inputDigests, versionAlignment, addedExports: Object.fromEntries(Object.entries(additions).filter(([, keys]) => keys.length)), fixedClock: new Date().toISOString(), counts, corpusTexts: texts.size, total: Object.values(counts).reduce((a, b) => a + b, 0), failed: failures.length, failures, gaps: ['stateful learning/watch/ingest replay not implemented', 'authorized lifecycle capability success sequences not implemented', 'mcp success samples cover selected tools; all registered tools exercise empty-argument errors', 'package version is aligned only in a disposable baseline copy; output values and hashes are compared exactly'] };
    if (reportPath)
        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ ...report, failures: failures.map(f => ({ group: f.group, label: f.label })) }, null, 2)}\n`);
    process.exitCode = failures.length ? 1 : 0;
}
finally {
    globalThis.Date = RealDate;
    rmSync(temp, { recursive: true, force: true });
}

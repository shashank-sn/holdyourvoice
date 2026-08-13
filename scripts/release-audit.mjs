import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const textExtensions = new Set(['.json', '.md', '.mjs', '.ts', '.yaml', '.yml']);
const credentialMarkers = [
  /(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*(?!['"]?(?:your|example|replace|<)[\w-]*['"]?$)[^\s]+/i,
  /authorization\s*:\s*bearer\s+\S+/i,
];
const networkMarkers = [/\bfetch\s*\(/, /\bhttps?\.request\b/, /\bWebSocket\b/, /from\s+['"]node:(?:http|https|net|tls)['"]/];
const forbiddenPaths = [/(^|\/)\.env(?:\.|$)/, /(^|\/)(?:profiles?|embeddings?|feedback-history|analytics)(?:\/|$)/i];
const privateUrlMarkers = [/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i, /^https?:\/\/[^/]+\.local(?:\/|$)/i];
const stage1CheckpointFiles = [
  'src/stage1-evaluation.ts',
  'scripts/evaluate-rewrite-benchmark.mjs',
  'scripts/run-stage1-dry-run.mjs',
  'scripts/run-stage1-human-packet.mjs',
  'benchmarks/schema/protocol-manifest.v1.schema.json',
  'benchmarks/schema/run-event.v1.schema.json',
  'benchmarks/schema/blind-packet.v1.schema.json',
  'benchmarks/schema/blind-mapping.v1.schema.json',
  'benchmarks/schema/reviewer-record.v1.schema.json',
  'benchmarks/schema/ratings-seal.v1.schema.json',
  'benchmarks/schema/aggregate-report.v1.schema.json',
  'benchmarks/schema/checkpoint-disposition.v1.schema.json',
];
const stage1Scripts = {
  'stage1:evaluate': 'node scripts/evaluate-rewrite-benchmark.mjs',
  'stage1:dry-run': 'npm run build && node scripts/run-stage1-dry-run.mjs',
  'stage1:human-packet': 'npm run build && node scripts/run-stage1-human-packet.mjs',
};

function candidateFiles() {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n');
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

function packageFiles() {
  const cache = mkdtempSync(join(tmpdir(), 'hyv-package-audit-'));
  try {
    const output = execFileSync('npm', ['pack', '--ignore-scripts', '--dry-run', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, npm_config_cache: cache },
    });
    const result = JSON.parse(output);
    if (!Array.isArray(result) || !Array.isArray(result[0]?.files)) throw new Error('npm pack returned no file list');
    return result[0].files.map((file) => file.path);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
}

function urls(text) {
  return [...text.matchAll(/https?:\/\/[^\s)'"<>]+/g)].map((match) => match[0]);
}

const packageManifest = JSON.parse(readFileSync('package.json', 'utf8'));
const mcpbManifest = JSON.parse(readFileSync('mcpb/manifest.json', 'utf8'));
const claudePluginManifest = JSON.parse(readFileSync('claude-plugin/.claude-plugin/plugin.json', 'utf8'));
const marketplaceManifest = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'));
const claudeMcpManifest = JSON.parse(readFileSync('claude-plugin/.mcp.json', 'utf8'));
const runtimeVersionSource = readFileSync('src/version.ts', 'utf8');
const mitLicense = readFileSync('LICENSE', 'utf8');
const mitRequiredClauses = [
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'The above copyright notice and this permission notice shall be included in all',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
];

const files = candidateFiles();
const failures = [];
for (const [name, command] of Object.entries(stage1Scripts)) {
  if (packageManifest.scripts?.[name] !== command) failures.push(`Stage 1 script contract has drifted: ${name}`);
}
for (const file of stage1CheckpointFiles) {
  if (!files.includes(file)) failures.push(`Stage 1 checkpoint contract is missing: ${file}`);
}
if (files.includes('src/stage1-evaluation.ts')) {
  const stage1Source = readFileSync('src/stage1-evaluation.ts', 'utf8');
  if (!stage1Source.includes("4e6269121d551c008a34db73077e1e4fea41b3f9")) failures.push('Stage 1 checkpoint baseline identity has drifted');
  if (!stage1Source.includes("550ea24f652291dca13757fdbd2f0fa0b5e3f621")) failures.push('Stage 1 candidate identity has drifted');
}
if (packageManifest.license !== 'MIT') failures.push('package.json must declare the MIT license');
if (mcpbManifest.version !== packageManifest.version) failures.push('MCPB manifest version must match package.json');
if (claudePluginManifest.version !== packageManifest.version) failures.push('Claude plugin version must match package.json');
const marketplacePlugin = marketplaceManifest.plugins?.find((plugin) => plugin.name === 'hold-your-voice');
if (!marketplacePlugin) failures.push('Claude marketplace must include hold-your-voice');
else if (marketplacePlugin.version !== packageManifest.version) failures.push('Claude marketplace version must match package.json');
if (!runtimeVersionSource.includes(`HYV_VERSION = '${packageManifest.version}'`)) failures.push('MCP runtime version must match package.json');
if (!claudeMcpManifest.mcpServers?.['hold-your-voice']?.args?.includes(`--package=@holdyourvoice/hyv@${packageManifest.version}`)) {
  failures.push('Claude plugin package pin must match package.json');
}
if (!Array.isArray(packageManifest.files) || !packageManifest.files.includes('LICENSE')) {
  failures.push('npm package must include LICENSE');
}
for (const requiredPath of ['dist', 'Readme.md']) {
  if (!Array.isArray(packageManifest.files) || !packageManifest.files.includes(requiredPath)) {
    failures.push(`npm package must include ${requiredPath}`);
  }
}
if (packageManifest.type !== 'module') failures.push('npm package must use the ESM runtime contract');
if (packageManifest.bin?.hyv !== 'dist/cli.js') failures.push('npm hyv binary must point to dist/cli.js');
if (packageManifest.engines?.node !== '>=20') failures.push('npm package must require Node 20 or newer');
const allowedPackageManifestPaths = new Set(['dist', 'Readme.md', 'LICENSE']);
for (const file of Array.isArray(packageManifest.files) ? packageManifest.files : []) {
  if (!allowedPackageManifestPaths.has(file)) failures.push(`npm package exposes an unexpected path: ${file}`);
}
const publicPackagePath = /^(?:package\.json|license|readme\.md|dist\/.+)$/i;
const forbiddenPackedPath = /(^|\/)(?:benchmarks?|profiles?|samples?|studies?|docs)(?:\/|$)/i;
for (const file of packageFiles()) {
  if (!publicPackagePath.test(file) || forbiddenPackedPath.test(file)) failures.push(`npm package contains an unexpected file: ${file}`);
}
for (const clause of mitRequiredClauses) {
  if (!mitLicense.includes(clause)) failures.push(`LICENSE is missing an MIT-required clause: ${clause}`);
}
for (const file of files) {
  if (forbiddenPaths.some((pattern) => pattern.test(file))) failures.push(`private or secret-bearing path: ${file}`);
  if (!textExtensions.has(extname(file))) continue;
  const text = readFileSync(file, 'utf8');
  if (credentialMarkers.some((pattern) => pattern.test(text))) failures.push(`credential marker: ${file}`);
  if (file.startsWith('src/') && networkMarkers.some((pattern) => pattern.test(text))) failures.push(`runtime network marker: ${file}`);
  for (const url of urls(text)) if (privateUrlMarkers.some((pattern) => pattern.test(url))) failures.push(`private or internal URL: ${file} (${url})`);
}

if (failures.length) throw new Error(`release audit failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
console.log('release audit passed');

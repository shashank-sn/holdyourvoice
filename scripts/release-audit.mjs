import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const textExtensions = new Set(['.json', '.md', '.mjs', '.ts', '.yaml', '.yml']);
const credentialMarkers = [
  /(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*(?!['"]?(?:your|example|replace|<)[\w-]*['"]?$)[^\s]+/i,
  /authorization\s*:\s*bearer\s+\S+/i,
];
const networkMarkers = [/\bfetch\s*\(/, /\bhttps?\.request\b/, /\bWebSocket\b/, /from\s+['"]node:(?:http|https|net|tls)['"]/];
const forbiddenPaths = [/(^|\/)\.env(?:\.|$)/, /(^|\/)(?:profiles?|embeddings?|feedback-history|analytics)(?:\/|$)/i];
const privateUrlMarkers = [/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i, /^https?:\/\/[^/]+\.local(?:\/|$)/i];

function candidateFiles() {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n');
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

function urls(text) {
  return [...text.matchAll(/https?:\/\/[^\s)'"<>]+/g)].map((match) => match[0]);
}

const packageManifest = JSON.parse(readFileSync('package.json', 'utf8'));
const mcpbManifest = JSON.parse(readFileSync('mcpb/manifest.json', 'utf8'));
const mitLicense = readFileSync('LICENSE', 'utf8');
const mitRequiredClauses = [
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'The above copyright notice and this permission notice shall be included in all',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
];

const failures = [];
if (packageManifest.license !== 'MIT') failures.push('package.json must declare the MIT license');
if (mcpbManifest.version !== packageManifest.version) failures.push('MCPB manifest version must match package.json');
if (!Array.isArray(packageManifest.files) || !packageManifest.files.includes('LICENSE')) {
  failures.push('npm package must include LICENSE');
}
for (const clause of mitRequiredClauses) {
  if (!mitLicense.includes(clause)) failures.push(`LICENSE is missing an MIT-required clause: ${clause}`);
}
for (const file of candidateFiles()) {
  if (forbiddenPaths.some((pattern) => pattern.test(file))) failures.push(`private or secret-bearing path: ${file}`);
  if (!textExtensions.has(extname(file))) continue;
  const text = readFileSync(file, 'utf8');
  if (credentialMarkers.some((pattern) => pattern.test(text))) failures.push(`credential marker: ${file}`);
  if (file.startsWith('src/') && networkMarkers.some((pattern) => pattern.test(text))) failures.push(`runtime network marker: ${file}`);
  for (const url of urls(text)) if (privateUrlMarkers.some((pattern) => pattern.test(url))) failures.push(`private or internal URL: ${file} (${url})`);
}

if (failures.length) throw new Error(`release audit failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
console.log('release audit passed');

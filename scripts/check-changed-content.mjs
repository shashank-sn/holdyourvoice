import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeAiEditor } from '../dist/ai-editor.js';
import { inspectHygiene } from '../dist/hygiene.js';

const [policyPath, changedPath] = process.argv.slice(2);
if (!policyPath || !changedPath) throw new Error('Usage: node scripts/check-changed-content.mjs .hyv/content-gate.json changed-files.txt');
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
if (policy.version !== '1' || !Array.isArray(policy.paths) || policy.paths.some((path) => typeof path !== 'string' || !path.startsWith('./'))) throw new Error('Content gate policy is invalid.');
const changed = readFileSync(changedPath, 'utf8').split('\n').filter(Boolean);
const eligible = changed.filter((file) => /\.mdx?$/i.test(file) && policy.paths.some((path) => file === path.slice(2) || file.startsWith(path.slice(2).replace(/\*\*$/, ''))));
const reports = eligible.map((file) => {
  const text = readFileSync(resolve(file), 'utf8');
  const editor = analyzeAiEditor(text);
  const hygiene = inspectHygiene(text);
  return { file, aiEditor: editor.findings.map((finding) => ({ id: finding.id, severity: finding.severity })), hygiene: { suspiciousCount: hygiene.suspiciousCount } };
});
const blocking = reports.some((report) => report.aiEditor.some((finding) => finding.severity === 'red'));
process.stdout.write(`${JSON.stringify({ version: '1', checked: reports, skipped: changed.filter((file) => !eligible.includes(file)), passed: !blocking, privacy: 'No draft contents are uploaded or sent to a network service by this script.' }, null, 2)}\n`);
if (blocking) process.exitCode = 2;

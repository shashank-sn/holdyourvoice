import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] ?? 'test-fixtures/rules');
for (const file of readdirSync(root).filter((name) => name.endsWith('.json')).sort()) {
  const rule = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  if (rule.version !== '1' || !/^[a-z][a-z0-9.-]+$/.test(rule.id ?? '') || !['stable', 'experimental'].includes(rule.channel) || !['red', 'yellow'].includes(rule.severity) || typeof rule.provenance !== 'string' || !Array.isArray(rule.positive) || !rule.positive.length || !Array.isArray(rule.counterexamples) || !rule.counterexamples.length || typeof rule.impact !== 'string') throw new Error(`Invalid contributed rule metadata: ${file}`);
}
console.log(JSON.stringify({ version: '1', status: 'PASS' }));

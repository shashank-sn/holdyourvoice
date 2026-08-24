import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeAiEditor } from '../dist/ai-editor.js';
import { comparePreservation } from '../dist/preservation.js';

const root = resolve(process.argv[2] ?? 'benchmarks');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const cases = manifest.partitions.flatMap((partition) => partition.cases.map((entry) => ({ partition: partition.id, entry, fixture: JSON.parse(readFileSync(resolve(root, entry.file), 'utf8')) })));
const formats = Object.fromEntries(cases.map(({ fixture }) => [fixture.task_class, 0]));
for (const { fixture } of cases) formats[fixture.task_class] += 1;
let expectedFindings = 0; let truePositives = 0; let falsePositives = 0; let falseNegatives = 0; let preservationCases = 0; let preservationPassed = 0;
for (const { fixture } of cases) {
  const expected = Array.isArray(fixture.expectation.finding_ids) ? fixture.expectation.finding_ids : [];
  const actual = analyzeAiEditor(fixture.draft).findings.map((finding) => finding.id);
  expectedFindings += expected.length;
  truePositives += expected.filter((id) => actual.includes(id)).length;
  falseNegatives += expected.filter((id) => !actual.includes(id)).length;
  falsePositives += actual.filter((id) => !expected.includes(id)).length;
  if (typeof fixture.counterexample === 'string') {
    const counterExpected = Array.isArray(fixture.expectation.counterexample_finding_ids) ? fixture.expectation.counterexample_finding_ids : [];
    const counterActual = analyzeAiEditor(fixture.counterexample).findings.map((finding) => finding.id);
    falsePositives += counterActual.filter((id) => !counterExpected.includes(id)).length;
    falseNegatives += counterExpected.filter((id) => !counterActual.includes(id)).length;
  }
  if (typeof fixture.candidate === 'string') { preservationCases += 1; if (comparePreservation(fixture.draft, fixture.candidate).orderedToken.wordSurvival >= 0.7) preservationPassed += 1; }
}
const scorecard = {
  version: '1', kind: 'deterministic-fixture-scorecard',
  limitation: 'This scorecard validates checked-in synthetic fixtures. It does not measure authorship, human preference, model rewrite quality, or production performance.',
  corpusDigest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), baseline: manifest.baseline,
  cases: cases.length, partitions: Object.fromEntries(manifest.partitions.map((partition) => [partition.id, partition.cases.length])), formats,
  expectations: { findingCases: cases.filter(({ fixture }) => Array.isArray(fixture.expectation.finding_ids)).length, counterexamples: cases.filter(({ fixture }) => typeof fixture.counterexample === 'string').length, candidates: cases.filter(({ fixture }) => typeof fixture.candidate === 'string').length },
  deterministicResults: { expectedFindings, truePositives, falsePositives, falseNegatives, preservationCases, preservationPassed },
};
const output = process.argv[3];
if (output) writeFileSync(output, `${JSON.stringify(scorecard, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify(scorecard, null, 2)}\n`);

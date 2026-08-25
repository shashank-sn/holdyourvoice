import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateLocalComposite } from './local-eval.js';

test('groups paragraph IDs before optional local composite evaluation', () => {
  const user = [{ paragraphId: 'u1', text: 'I check the source and explain the mechanism.' }, { paragraphId: 'u2', text: 'The owner names one next step for the release.' }, { paragraphId: 'u3', text: 'I keep the evidence visible for the operator.' }];
  const shadow = [{ paragraphId: 's1', text: 'This transformative framework unlocks synergy.' }, { paragraphId: 's2', text: 'The holistic ecosystem creates value.' }, { paragraphId: 's3', text: 'This is a game-changer for every stakeholder.' }];
  const report = evaluateLocalComposite('We leverage a holistic framework.', 'We check the source and name the next step.', user, shadow);
  assert.equal(report.version, '1');
  assert.equal(report.split.trainParagraphIds.some((id) => report.split.testParagraphIds.includes(id)), false);
  assert.ok(report.contentF1 >= 0 && report.contentF1 <= 1);
  assert.ok(report.stylometricCosine9 >= 0 && report.stylometricCosine9 <= 1);
  assert.equal(report.aiTellReduction.candidateFindings < report.aiTellReduction.inputFindings, true);
});

test('keeps every paragraph variant on one side of the local evaluation split', () => {
  const user = [{ paragraphId: 'u1', text: 'I inspect the source.' }, { paragraphId: 'u1', text: 'I inspect the source before shipping.' }, { paragraphId: 'u2', text: 'I name the mechanism.' }];
  const shadow = [{ paragraphId: 's1', text: 'This holistic framework transforms outcomes.' }, { paragraphId: 's1', text: 'This transformative framework unlocks outcomes.' }, { paragraphId: 's2', text: 'The ecosystem creates value.' }];
  const report = evaluateLocalComposite('The source is visible.', 'I inspect the source before shipping.', user, shadow);
  assert.equal(report.split.trainParagraphIds.includes('u1'), report.split.testParagraphIds.includes('u1') === false);
  assert.equal(report.split.trainParagraphIds.includes('s1'), report.split.testParagraphIds.includes('s1') === false);
});

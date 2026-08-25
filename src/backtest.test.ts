import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateIsolatedBacktest } from './backtest.js';
import { buildProfile } from './voice-dna.js';

test('keeps an isolated backtest generation-free and text-free in its report', () => {
  const samples = [
    'I name the constraint first and explain the mechanism with direct words for the person doing the work. The owner checks each source before the release moves into the production queue.',
    'The owner checks the source before the release moves into the production queue and records the evidence for later review. I keep the next step clear for the person handling the release.',
    'I keep evidence visible and choose one next step for the person doing the work before the deployment window opens. The operator records the trade-off and names the owner for the rollback.',
  ];
  const target = 'The owner checks the source before the release and records the rollback evidence for the operator doing the production work.';
  const candidate = 'The owner checks the source before the release and records the rollback evidence for the operator doing the production work.';
  const report = evaluateIsolatedBacktest('Reply to the rollout question with the owner and check.', target, candidate, buildProfile(samples), samples);
  assert.equal(report.version, '1');
  assert.equal(report.preservation.score, 100);
  assert.equal(report.heldout.selfSimilarity?.ceiling, 100);
  assert.equal(JSON.stringify(report).includes(target), false);
  assert.equal(JSON.stringify(report).includes(candidate), false);
});

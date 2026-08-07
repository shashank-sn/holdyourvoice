import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSemanticVerdict, reviewSemanticVerdicts } from './semantic-review.js';

test('accepts only three independent clean semantic verdicts', () => {
  const result = reviewSemanticVerdicts(['deepseek', 'kimi', 'sonnet'].map((evaluatorId) => parseSemanticVerdict(evaluatorId, { approved: true, violations: [] })));
  assert.equal(result.status, 'accepted');
});

test('escalates disagreement and action drift', () => {
  const disagreement = reviewSemanticVerdicts([
    parseSemanticVerdict('deepseek', { approved: true, violations: [] }),
    parseSemanticVerdict('kimi', { approved: false, violations: ['action_change'] }),
    parseSemanticVerdict('sonnet', { approved: false, violations: ['action_change'] }),
  ]);
  assert.equal(disagreement.reason, 'evaluator_disagreement');
  const rejected = reviewSemanticVerdicts(['deepseek', 'kimi', 'sonnet'].map((evaluatorId) => parseSemanticVerdict(evaluatorId, { approved: false, violations: ['action_change'] })));
  assert.equal(rejected.reason, 'semantic_violation');
});

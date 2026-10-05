import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { FEEDBACK_URL, feedbackNotice } from './feedback.js';

const cli = new URL('../cli.js', import.meta.url).pathname;

test('feedback notice reaches a person at a terminal after a command', () => {
  const notice = feedbackNotice({ command: 'patterns', isTTY: true, env: {} });
  assert.ok(notice?.includes(FEEDBACK_URL));
  assert.ok(notice?.includes('HYV_NO_FEEDBACK=1'));
  assert.equal(notice?.includes('\n'), false);
});

test('feedback notice stays silent for pipes, agents, ci, the mcp server, and opt-out', () => {
  assert.equal(feedbackNotice({ command: 'patterns', isTTY: false, env: {} }), undefined);
  assert.equal(feedbackNotice({ command: 'patterns', isTTY: true, env: { CI: 'true' } }), undefined);
  assert.equal(feedbackNotice({ command: 'patterns', isTTY: true, env: { HYV_NO_FEEDBACK: '1' } }), undefined);
  assert.equal(feedbackNotice({ command: 'mcp', isTTY: true, env: {} }), undefined);
  assert.equal(feedbackNotice({ command: undefined, isTTY: true, env: {} }), undefined);
});

test('piped cli output carries no feedback notice', () => {
  const result = spawnSync(process.execPath, [cli, 'patterns'], { encoding: 'utf8', env: { ...process.env, CI: '', HYV_NO_FEEDBACK: '' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr.includes(FEEDBACK_URL), false);
  assert.equal(result.stdout.includes(FEEDBACK_URL), false);
});

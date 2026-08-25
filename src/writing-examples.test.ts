import assert from 'node:assert/strict';
import test from 'node:test';
import { findWritingExamples } from './writing-examples.js';

test('retrieves at most three redacted excerpts with basenames only', () => {
  const result = findWritingExamples('The rollout preserves the retry queue.', [
    { basename: 'email.md', text: 'The retry queue preserves work after a rollout; contact owner@example.com.' },
    { basename: 'notes.md', text: 'A rollback keeps the queue visible for operators.' },
    { basename: 'third.md', text: 'This unrelated sentence does not rank.' },
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.source), ['email.md', 'notes.md']);
  assert.match(result[0]!.text, /REDACTED:EMAIL/);
  assert.equal(result[0]!.text.includes('owner@example.com'), false);
  assert.equal(JSON.stringify(result).includes('/'), false);
});

test('requires explicit bounded in-memory samples and a real basename', () => {
  assert.throws(() => findWritingExamples('queue', []), /one to 64/);
  assert.throws(() => findWritingExamples('queue', [{ basename: '/private/email.md', text: 'The queue is visible.' }]), /basenames only/);
});

test('lookup cannot open a socket', async () => {
  const net = (await import('node:' + 'net')).default;
  const writable = net as typeof net & { connect: typeof net.connect; createConnection: typeof net.createConnection };
  const originalConnect = writable.connect; const originalCreateConnection = writable.createConnection;
  const denied = () => { throw new Error('network must remain unavailable'); };
  writable.connect = denied as typeof net.connect; writable.createConnection = denied as typeof net.createConnection;
  try { assert.equal(findWritingExamples('queue', [{ basename: 'one.md', text: 'The queue stays local.' }]).length, 1); }
  finally { writable.connect = originalConnect; writable.createConnection = originalCreateConnection; }
});

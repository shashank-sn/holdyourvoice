import assert from 'node:assert/strict';
import test from 'node:test';
import type { FSWatcher } from 'node:fs';
import { watchProfileSamples } from './profile-watch.js';

test('watches only explicit samples and debounces one local rebuild', () => {
  const listeners: Array<() => void> = []; let rebuilt = 0; let pending: (() => void) | undefined; let closed = 0;
  const handle = watchProfileSamples({
    samples: ['one.md', 'two.md'], debounceMs: 100, rebuild: () => { rebuilt += 1; },
    watchFile: (_path, listener) => { listeners.push(listener); return { close: () => { closed += 1; } } as FSWatcher; },
    schedule: (callback) => { pending = callback; return 1 as unknown as ReturnType<typeof setTimeout>; },
    cancel: () => { pending = undefined; },
  });
  listeners[0]!(); listeners[1]!();
  assert.equal(rebuilt, 0);
  pending!(); assert.equal(rebuilt, 1);
  handle.close(); assert.equal(closed, 2);
  assert.throws(() => watchProfileSamples({ samples: ['one.md'], rebuild: () => undefined }), /at least two/);
});

import { watch, type FSWatcher } from 'node:fs';

export interface ProfileWatchOptions {
  samples: string[];
  debounceMs?: number;
  rebuild: () => void;
  watchFile?: (path: string, listener: () => void) => FSWatcher;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface ProfileWatchHandle {
  close(): void;
}

/** Watches only explicitly named local samples and collapses bursts into one rebuild. */
export function watchProfileSamples(options: ProfileWatchOptions): ProfileWatchHandle {
  if (options.samples.length < 2) throw new Error('Profile watch requires at least two explicit local samples.');
  const debounceMs = options.debounceMs ?? 500;
  if (!Number.isInteger(debounceMs) || debounceMs < 100 || debounceMs > 60_000) throw new Error('Profile watch debounce must be an integer from 100 to 60000 milliseconds.');
  const createWatcher = options.watchFile ?? ((path, listener) => watch(path, { persistent: true }, listener));
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const trigger = () => {
    if (closed) return;
    if (timer) cancel(timer);
    timer = schedule(() => { timer = undefined; if (!closed) options.rebuild(); }, debounceMs);
  };
  const watchers = options.samples.map((path) => createWatcher(path, trigger));
  return {
    close() {
      if (closed) return;
      closed = true;
      if (timer) cancel(timer);
      for (const watcher of watchers) watcher.close();
    },
  };
}

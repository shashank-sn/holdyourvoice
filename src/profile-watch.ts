import { watch, type FSWatcher } from 'node:fs';

type ProfileWatchTimer = ReturnType<typeof setTimeout>;

export interface ProfileWatchOptions {
  samples: string[];
  debounceMs?: number;
  rebuild: () => void;
  watchFile?: (path: string, listener: () => void) => FSWatcher;
  schedule?: (callback: () => void, delay: number) => ProfileWatchTimer;
  cancel?: (timer: ProfileWatchTimer) => void;
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
  const schedule: NonNullable<ProfileWatchOptions['schedule']> = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
  const cancel: NonNullable<ProfileWatchOptions['cancel']> = options.cancel ?? ((timer) => clearTimeout(timer));
  let timer: ProfileWatchTimer | undefined;
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

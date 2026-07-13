import type { CatalogTranslationKey } from '@pkg/domain';

export type TranslationMarker = { mark: (key: CatalogTranslationKey) => void };

type Entry = { dirty: false; state: 'waiting'; timer: unknown } | { dirty: boolean; state: 'running' };

type TranslationSchedulerOptions = {
  concurrency?: number;
  clearTimer?: (timer: unknown) => void;
  debounceMs?: number;
  onError?: (error: unknown, key: CatalogTranslationKey) => void;
  run: (key: CatalogTranslationKey) => Promise<unknown>;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
};

export class TranslationScheduler {
  readonly #debounceMs: number;
  readonly #clearTimer: NonNullable<TranslationSchedulerOptions['clearTimer']>;
  readonly #entries = new Map<CatalogTranslationKey, Entry>();
  readonly #limit: ConcurrencyLimit;
  readonly #onError: NonNullable<TranslationSchedulerOptions['onError']>;
  readonly #run: TranslationSchedulerOptions['run'];
  readonly #setTimer: NonNullable<TranslationSchedulerOptions['setTimer']>;
  #disposed = false;

  constructor({
    clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    concurrency = 2,
    debounceMs = 60_000,
    onError = () => undefined,
    run,
    setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  }: TranslationSchedulerOptions) {
    if (!Number.isInteger(debounceMs) || debounceMs < 0) {
      throw new Error('Translation scheduler debounce must be a non-negative integer');
    }

    this.#debounceMs = debounceMs;
    this.#clearTimer = clearTimer;
    this.#limit = new ConcurrencyLimit(concurrency);
    this.#onError = onError;
    this.#run = run;
    this.#setTimer = setTimer;
  }

  mark(key: CatalogTranslationKey): void {
    if (this.#disposed) return;

    const current = this.#entries.get(key);
    if (current?.state === 'running') {
      current.dirty = true;
      return;
    }
    if (current?.state === 'waiting') {
      this.#clearTimer(current.timer);
    }

    const timer = this.#setTimer(() => void this.#fire(key), this.#debounceMs);
    this.#entries.set(key, { dirty: false, state: 'waiting', timer });
  }

  dispose(): void {
    this.#disposed = true;
    for (const entry of this.#entries.values()) {
      if (entry.state === 'waiting') this.#clearTimer(entry.timer);
    }
    this.#entries.clear();
  }

  async #fire(key: CatalogTranslationKey): Promise<void> {
    const entry = this.#entries.get(key);
    if (entry?.state !== 'waiting') return;

    const running: Entry = { dirty: false, state: 'running' };
    this.#entries.set(key, running);

    try {
      await this.#limit.run(() => this.#run(key));
    } catch (error) {
      this.#onError(error, key);
    }

    if (this.#entries.get(key) !== running) return;

    this.#entries.delete(key);
    if (running.dirty && !this.#disposed) this.mark(key);
  }
}

class ConcurrencyLimit {
  readonly #concurrency: number;
  readonly #waiting: Array<() => void> = [];
  #active = 0;

  constructor(concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('Translation concurrency must be a positive integer');
    }
    this.#concurrency = concurrency;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.#active >= this.#concurrency) {
      await new Promise<void>((resolve) => this.#waiting.push(resolve));
    }

    this.#active += 1;
    try {
      return await task();
    } finally {
      this.#active -= 1;
      this.#waiting.shift()?.();
    }
  }
}

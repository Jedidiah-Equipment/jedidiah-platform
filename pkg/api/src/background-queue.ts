import { ConcurrencyLimit } from './concurrency-limit.js';

/**
 * Runs keyed work in the background so a request never waits on it, a few at a time. In-process, like the catalog
 * translation scheduler: a restart drops what is queued, and `resume` picks the unfinished keys up at the next start.
 */
export class BackgroundQueue<TKey> {
  readonly #run: (key: TKey) => Promise<unknown>;
  readonly #onError: (error: unknown, key: TKey) => void;
  readonly #limit: ConcurrencyLimit;
  readonly #running = new Set<Promise<void>>();
  #disposed = false;

  constructor({
    run,
    onError = () => undefined,
    concurrency = 2,
  }: {
    run: (key: TKey) => Promise<unknown>;
    onError?: (error: unknown, key: TKey) => void;
    concurrency?: number;
  }) {
    this.#run = run;
    this.#onError = onError;
    this.#limit = new ConcurrencyLimit(concurrency);
  }

  schedule(key: TKey): void {
    if (this.#disposed) return;
    const work: Promise<void> = this.#limit
      .run(async () => {
        if (!this.#disposed) await this.#run(key);
      })
      .catch((error: unknown) => this.#onError(error, key))
      .finally(() => this.#running.delete(work));
    this.#running.add(work);
  }

  /** Schedules every key still waiting on its work, such as those a restart interrupted. */
  async resume(awaiting: () => Promise<readonly TKey[]>): Promise<void> {
    for (const key of await awaiting()) this.schedule(key);
  }

  /** Settles once all work scheduled so far has finished. */
  async drain(): Promise<void> {
    await Promise.all([...this.#running]);
  }

  /** Starts no further work, and settles once what is already running has finished. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.drain();
  }
}

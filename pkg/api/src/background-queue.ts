import { ConcurrencyLimit } from './concurrency-limit.js';
import type { RuntimeService } from './runtime-service.js';

type BackgroundQueueOptions<TKey> = {
  run: (key: TKey) => Promise<unknown>;
  onError?: (error: unknown, key: TKey) => void;
  concurrency?: number;
  /** Lists the keys an earlier process left waiting, so `start` schedules them again. */
  resume?: { awaiting: () => Promise<readonly TKey[]>; onError: (error: unknown) => void };
};

/**
 * Runs keyed work in the background so a request never waits on it, a few at a time. In-process, like the catalog
 * translation scheduler: a restart drops what is queued, and `start` picks the unfinished keys up at the next boot.
 */
export class BackgroundQueue<TKey> implements RuntimeService {
  readonly #run: BackgroundQueueOptions<TKey>['run'];
  readonly #onError: NonNullable<BackgroundQueueOptions<TKey>['onError']>;
  readonly #resume: BackgroundQueueOptions<TKey>['resume'];
  readonly #limit: ConcurrencyLimit;
  readonly #running = new Set<Promise<void>>();
  #disposed = false;

  constructor({ run, onError = () => undefined, concurrency = 2, resume }: BackgroundQueueOptions<TKey>) {
    this.#run = run;
    this.#onError = onError;
    this.#resume = resume;
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
  start(): void {
    const resume = this.#resume;
    if (!resume || this.#disposed) return;
    const listing: Promise<void> = Promise.resolve()
      .then(() => resume.awaiting())
      .then((keys) => {
        for (const key of keys) this.schedule(key);
      })
      .catch((error: unknown) => resume.onError(error))
      .finally(() => this.#running.delete(listing));
    this.#running.add(listing);
  }

  /** Settles once all work scheduled so far, including a listing still in flight, has finished. */
  async drain(): Promise<void> {
    while (this.#running.size > 0) await Promise.all([...this.#running]);
  }

  /** Starts no further work, and settles once what is already running has finished. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.drain();
  }
}

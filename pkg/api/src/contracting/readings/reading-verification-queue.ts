import { ConcurrencyLimit } from '../../concurrency-limit.js';

/** Schedules a captured reading's AI check after the capture has answered. */
export type ReadingVerifications = { schedule: (readingId: string) => void };

/**
 * Runs each check in the background so capturing never waits on the AI, a few at a time. In-process, like the catalog
 * translation scheduler: a restart leaves its readings pending, and `resume` picks them up again at the next start.
 */
export class ReadingVerificationQueue implements ReadingVerifications {
  readonly #run: (readingId: string) => Promise<unknown>;
  readonly #onError: (error: unknown, readingId: string) => void;
  readonly #limit: ConcurrencyLimit;
  readonly #running = new Set<Promise<void>>();
  #disposed = false;

  constructor({
    run,
    onError = () => undefined,
    concurrency = 2,
  }: {
    run: (readingId: string) => Promise<unknown>;
    onError?: (error: unknown, readingId: string) => void;
    concurrency?: number;
  }) {
    this.#run = run;
    this.#onError = onError;
    this.#limit = new ConcurrencyLimit(concurrency);
  }

  schedule(readingId: string): void {
    if (this.#disposed) return;
    const check: Promise<void> = this.#limit
      .run(async () => {
        if (!this.#disposed) await this.#run(readingId);
      })
      .catch((error: unknown) => this.#onError(error, readingId))
      .finally(() => this.#running.delete(check));
    this.#running.add(check);
  }

  /** Schedules every reading still waiting on its check, such as those a restart interrupted. */
  async resume(awaiting: () => Promise<readonly string[]>): Promise<void> {
    for (const readingId of await awaiting()) this.schedule(readingId);
  }

  /** Settles once every check scheduled so far has finished. */
  async drain(): Promise<void> {
    await Promise.all([...this.#running]);
  }

  /** Starts no further checks, and settles once those already running have finished. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.drain();
  }
}

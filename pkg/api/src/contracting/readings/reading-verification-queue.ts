/** Schedules a captured reading's AI check after the capture has answered. */
export type ReadingVerifications = { schedule: (readingId: string) => void };

/**
 * Runs each check in the background so capturing never waits on the AI. In-process, like the catalog translation
 * scheduler: a restart mid-check leaves that reading pending, and Re-verify finishes it.
 */
export class ReadingVerificationQueue implements ReadingVerifications {
  readonly #run: (readingId: string) => Promise<unknown>;
  readonly #onError: (error: unknown, readingId: string) => void;
  readonly #running = new Set<Promise<void>>();
  #disposed = false;

  constructor({
    run,
    onError = () => undefined,
  }: {
    run: (readingId: string) => Promise<unknown>;
    onError?: (error: unknown, readingId: string) => void;
  }) {
    this.#run = run;
    this.#onError = onError;
  }

  schedule(readingId: string): void {
    if (this.#disposed) return;
    const check: Promise<void> = this.#run(readingId)
      .then(
        () => undefined,
        (error: unknown) => this.#onError(error, readingId),
      )
      .finally(() => this.#running.delete(check));
    this.#running.add(check);
  }

  /** Settles once every check scheduled so far has finished. */
  async drain(): Promise<void> {
    await Promise.all([...this.#running]);
  }

  dispose(): void {
    this.#disposed = true;
  }
}

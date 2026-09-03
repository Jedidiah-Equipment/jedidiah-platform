export class ConcurrencyLimit {
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

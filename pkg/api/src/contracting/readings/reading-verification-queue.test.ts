import { describe, expect, it } from 'vitest';
import { ReadingVerificationQueue } from './reading-verification-queue.js';

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

describe('ReadingVerificationQueue', () => {
  it('checks a few readings at a time and logs a failed one', async () => {
    const gate = deferred();
    const started: string[] = [];
    const failed: string[] = [];
    const queue = new ReadingVerificationQueue({
      concurrency: 2,
      run: async (id) => {
        started.push(id);
        await gate.promise;
        if (id === 'b') throw new Error('Model unavailable');
      },
      onError: (_error, id) => failed.push(id),
    });
    await queue.resume(async () => ['a', 'b', 'c']);
    await Promise.resolve();
    expect(started).toEqual(['a', 'b']);
    gate.resolve();
    await queue.drain();
    expect(started).toEqual(['a', 'b', 'c']);
    expect(failed).toEqual(['b']);
  });

  it('starts nothing new once disposed, and waits for the checks already running', async () => {
    const gate = deferred();
    const finished: string[] = [];
    const queue = new ReadingVerificationQueue({
      concurrency: 1,
      run: async (id) => {
        await gate.promise;
        finished.push(id);
      },
    });
    queue.schedule('a');
    queue.schedule('b');
    const disposed = queue.dispose();
    queue.schedule('c');
    gate.resolve();
    await disposed;
    expect(finished).toEqual(['a']);
  });
});

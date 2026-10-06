import { describe, expect, it } from 'vitest';
import { BackgroundQueue } from './background-queue.js';

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

describe('BackgroundQueue', () => {
  it('runs a few keys at a time and reports a failed one', async () => {
    const gate = deferred();
    const started: string[] = [];
    const failed: string[] = [];
    const queue = new BackgroundQueue<string>({
      concurrency: 2,
      run: async (id) => {
        started.push(id);
        await gate.promise;
        if (id === 'b') throw new Error('Model unavailable');
      },
      onError: (_error, id) => failed.push(id),
    });
    for (const id of ['a', 'b', 'c']) queue.schedule(id);
    await Promise.resolve();
    expect(started).toEqual(['a', 'b']);
    gate.resolve();
    await queue.drain();
    expect(started).toEqual(['a', 'b', 'c']);
    expect(failed).toEqual(['b']);
  });

  it('schedules the keys left waiting when it starts', async () => {
    const ran: string[] = [];
    const queue = new BackgroundQueue<string>({
      run: async (id) => {
        ran.push(id);
      },
      resume: { awaiting: async () => ['a', 'b'], onError: () => undefined },
    });
    queue.start();
    await queue.drain();
    expect(ran).toEqual(['a', 'b']);
  });

  it('reports a failed listing instead of throwing from start', async () => {
    const errors: unknown[] = [];
    const queue = new BackgroundQueue<string>({
      run: async () => undefined,
      resume: {
        awaiting: async () => {
          throw new Error('Database unavailable');
        },
        onError: (error) => errors.push(error),
      },
    });
    queue.start();
    await queue.drain();
    expect(errors).toHaveLength(1);
  });

  it('starts nothing new once disposed, and waits for the work already running', async () => {
    const gate = deferred();
    const finished: string[] = [];
    const queue = new BackgroundQueue<string>({
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

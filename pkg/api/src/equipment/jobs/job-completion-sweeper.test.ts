import { describe, expect, test, vi } from 'vitest';

import { getMillisecondsUntilNextSweep, JobCompletionSweeper } from './job-completion-sweeper.js';

const HOUR = 60 * 60 * 1000;

function createHarness({ run }: { run: () => Promise<unknown> }) {
  const timers: { callback: () => void; delayMs: number }[] = [];
  const cleared: unknown[] = [];
  const errors: unknown[] = [];

  const sweeper = new JobCompletionSweeper({
    clearTimer: (timer) => cleared.push(timer),
    now: () => new Date('2026-07-28T12:00:00.000+02:00'),
    onError: (error) => errors.push(error),
    run,
    setTimer: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length;
    },
  });

  return { cleared, errors, sweeper, timers };
}

describe('getMillisecondsUntilNextSweep', () => {
  test('waits for 01:00 plant time later the same day', () => {
    expect(getMillisecondsUntilNextSweep(new Date('2026-07-28T00:00:00.000+02:00'))).toBe(HOUR);
  });

  test('rolls to the next day once the sweep hour has passed', () => {
    expect(getMillisecondsUntilNextSweep(new Date('2026-07-28T01:30:00.000+02:00'))).toBe(23.5 * HOUR);
  });

  test('measures against plant time, not the host timezone', () => {
    // 23:00 UTC is already 01:00 the next day in Johannesburg, so the next run is a full day out.
    expect(getMillisecondsUntilNextSweep(new Date('2026-07-27T23:00:00.000Z'))).toBe(24 * HOUR);
  });
});

describe('JobCompletionSweeper', () => {
  test('sweeps on start, then arms the next plant-daily run', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const { sweeper, timers } = createHarness({ run });

    sweeper.start();
    await vi.waitFor(() => expect(timers).toHaveLength(1));

    expect(run).toHaveBeenCalledTimes(1);
    // 12:00 plant time to 01:00 the next day.
    expect(timers[0]?.delayMs).toBe(13 * HOUR);
  });

  test('keeps sweeping after a failed run and reports the error', async () => {
    const failure = new Error('sweep failed');
    const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const { errors, sweeper, timers } = createHarness({ run });

    sweeper.start();
    await vi.waitFor(() => expect(timers).toHaveLength(1));

    expect(errors).toEqual([failure]);

    timers[0]?.callback();
    await vi.waitFor(() => expect(timers).toHaveLength(2));

    expect(run).toHaveBeenCalledTimes(2);
  });

  test('does not arm another run once disposed', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const { sweeper, timers } = createHarness({ run });

    sweeper.dispose();
    sweeper.start();

    expect(run).not.toHaveBeenCalled();
    expect(timers).toHaveLength(0);
  });

  test('clears a pending timer on dispose', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const { cleared, sweeper, timers } = createHarness({ run });

    sweeper.start();
    await vi.waitFor(() => expect(timers).toHaveLength(1));

    sweeper.dispose();

    expect(cleared).toHaveLength(1);
  });
});

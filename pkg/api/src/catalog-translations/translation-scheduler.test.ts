import { afterEach, describe, expect, test, vi } from 'vitest';

import { TranslationScheduler } from './translation-scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('TranslationScheduler', () => {
  test('coalesces rapid marks into one run after edits settle', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const scheduler = new TranslationScheduler({ debounceMs: 60_000, run });

    scheduler.mark('product:00000000-0000-4000-8000-000000000001');
    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.mark('product:00000000-0000-4000-8000-000000000001');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledOnce();

    scheduler.dispose();
  });

  test('markNow fires immediately instead of waiting for the debounce', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const scheduler = new TranslationScheduler({ debounceMs: 60_000, run });

    scheduler.markNow('product:00000000-0000-4000-8000-000000000001');
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledOnce();

    scheduler.dispose();
  });

  test('markNow single-flights and reruns once when an edit lands mid-run', async () => {
    vi.useFakeTimers();
    let finishFirstRun: (() => void) | undefined;
    const firstRun = new Promise<void>((resolve) => {
      finishFirstRun = resolve;
    });
    const run = vi
      .fn()
      .mockImplementationOnce(() => firstRun)
      .mockResolvedValue(undefined);
    const scheduler = new TranslationScheduler({ debounceMs: 100, run });
    const key = 'product:00000000-0000-4000-8000-000000000001' as const;

    scheduler.markNow(key);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledOnce();

    scheduler.mark(key);
    finishFirstRun?.();
    await firstRun;
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.dispose();
  });

  test('runs exactly once more when marked during an in-flight run', async () => {
    vi.useFakeTimers();
    let finishFirstRun: (() => void) | undefined;
    const firstRun = new Promise<void>((resolve) => {
      finishFirstRun = resolve;
    });
    const run = vi
      .fn()
      .mockImplementationOnce(() => firstRun)
      .mockResolvedValue(undefined);
    const scheduler = new TranslationScheduler({ debounceMs: 100, run });
    const key = 'product:00000000-0000-4000-8000-000000000001' as const;

    scheduler.mark(key);
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledOnce();

    scheduler.mark(key);
    scheduler.mark(key);
    finishFirstRun?.();
    await firstRun;
    await vi.advanceTimersByTimeAsync(99);
    expect(run).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.dispose();
  });

  test('does not wedge a key after a failed run', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new Error('model unavailable')).mockResolvedValue(undefined);
    const scheduler = new TranslationScheduler({ debounceMs: 100, onError, run });
    const key = 'product_range:00000000-0000-4000-8000-000000000001' as const;

    scheduler.mark(key);
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledOnce();

    scheduler.mark(key);
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.dispose();
  });

  test('caps concurrent runs across entity keys', async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const run = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
    });
    const scheduler = new TranslationScheduler({ concurrency: 2, debounceMs: 100, run });

    scheduler.mark('product:00000000-0000-4000-8000-000000000001');
    scheduler.mark('product_range:00000000-0000-4000-8000-000000000002');
    scheduler.mark('product_range_variant:00000000-0000-4000-8000-000000000003');
    await vi.advanceTimersByTimeAsync(100);

    expect(run).toHaveBeenCalledTimes(2);
    expect(peak).toBe(2);

    releases.shift()?.();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(3));
    expect(peak).toBe(2);

    releases.splice(0).forEach((release) => {
      release();
    });
    scheduler.dispose();
  });
});

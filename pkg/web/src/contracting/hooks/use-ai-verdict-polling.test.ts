import { AI_VERDICT_POLL_LIMIT_MS, AI_VERDICT_POLL_MS } from '@pkg/domain/contracting';
import { describe, expect, it } from 'vitest';
import { pollWindow } from './use-ai-verdict-polling.js';

describe('pollWindow', () => {
  it('asks again while a check is pending and stops once nothing is', () => {
    const started = pollWindow(null, ['a'], 0);
    expect(started.interval).toBe(AI_VERDICT_POLL_MS);
    expect(pollWindow(started.window, [], 1_000)).toEqual({ window: null, interval: false });
  });

  it('gives up on a check pending past the limit', () => {
    const started = pollWindow(null, ['a'], 0);
    expect(pollWindow(started.window, ['a'], AI_VERDICT_POLL_LIMIT_MS).interval).toBe(false);
  });

  it('restarts for a new capture even beside an older failed check', () => {
    const stale = pollWindow(pollWindow(null, ['a'], 0).window, ['a'], AI_VERDICT_POLL_LIMIT_MS);
    const joined = pollWindow(stale.window, ['a', 'b'], AI_VERDICT_POLL_LIMIT_MS + 1);
    expect(joined.interval).toBe(AI_VERDICT_POLL_MS);
  });
});

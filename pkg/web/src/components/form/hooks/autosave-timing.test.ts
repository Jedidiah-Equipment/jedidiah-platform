import { describe, expect, it } from 'vitest';

import { flushAfterFormStateCommit } from './autosave-timing.js';

describe('flushAfterFormStateCommit', () => {
  it('waits for a field blur to commit its latest value before flushing', async () => {
    let currentValue = 'before blur';
    let savedValue: string | undefined;

    flushAfterFormStateCommit(() => {
      savedValue = currentValue;
    });
    currentValue = 'after blur';

    await Promise.resolve();

    expect(savedValue).toBe('after blur');
  });
});

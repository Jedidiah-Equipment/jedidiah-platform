import { describe, expect, it, vi } from 'vitest';

import { runAfterPurchaseOrderAutosaves } from './purchase-order-lifecycle.js';

describe('Purchase Order lifecycle actions', () => {
  it('waits for every edited form to save before marking the order sent', async () => {
    let finishLineSave: ((didSave: boolean) => void) | undefined;
    const headerFlush = vi.fn().mockResolvedValue(true);
    const lineFlush = vi.fn(() => new Promise<boolean>((resolve) => (finishLineSave = resolve)));
    const jobFlush = vi.fn().mockResolvedValue(true);
    const markSent = vi.fn().mockResolvedValue(undefined);

    const result = runAfterPurchaseOrderAutosaves([headerFlush, lineFlush, jobFlush], markSent);

    await Promise.resolve();
    expect(markSent).not.toHaveBeenCalled();
    finishLineSave?.(true);

    await expect(result).resolves.toBe(true);
    expect(markSent).toHaveBeenCalledOnce();
  });

  it('does not run the lifecycle action when any form remains invalid or failed', async () => {
    const action = vi.fn().mockResolvedValue(undefined);

    await expect(
      runAfterPurchaseOrderAutosaves([vi.fn().mockResolvedValue(true), vi.fn().mockResolvedValue(false)], action),
    ).resolves.toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('propagates a rejected lifecycle action so the click boundary can handle it', async () => {
    const error = new Error('send failed');

    await expect(
      runAfterPurchaseOrderAutosaves([vi.fn().mockResolvedValue(true)], vi.fn().mockRejectedValue(error)),
    ).rejects.toBe(error);
  });
});

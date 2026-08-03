import { describe, expect, it, vi } from 'vitest';

import { ensurePurchaseOrderPreview } from './purchase-order-preview.js';

describe('ensurePurchaseOrderPreview', () => {
  it('resolves only after the PDF response succeeds', async () => {
    const fetcher = vi.fn(async () => new Response('pdf', { status: 200 }));

    await expect(ensurePurchaseOrderPreview('/preview', fetcher)).resolves.toBeUndefined();
  });

  it('rejects an unsuccessful PDF response', async () => {
    const fetcher = vi.fn(async () => new Response('no preview', { status: 500 }));

    await expect(ensurePurchaseOrderPreview('/preview', fetcher)).rejects.toThrow('status 500');
  });
});

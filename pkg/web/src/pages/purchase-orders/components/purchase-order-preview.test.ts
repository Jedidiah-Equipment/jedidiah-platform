import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadPurchaseOrderPreview } from './purchase-order-preview.js';

describe('loadPurchaseOrderPreview', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns a browser URL only after the PDF response succeeds', async () => {
    const pdf = new Blob(['pdf'], { type: 'application/pdf' });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:purchase-order-preview');
    const fetcher = vi.fn(async () => new Response(pdf, { status: 200 }));

    await expect(loadPurchaseOrderPreview('/preview', fetcher)).resolves.toBe('blob:purchase-order-preview');
    expect(createObjectURL).toHaveBeenCalledWith(pdf);
  });

  it('rejects an unsuccessful PDF response', async () => {
    const fetcher = vi.fn(async () => new Response('no preview', { status: 500 }));

    await expect(loadPurchaseOrderPreview('/preview', fetcher)).rejects.toThrow('status 500');
  });
});

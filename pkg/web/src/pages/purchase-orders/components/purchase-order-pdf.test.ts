import type { UUID } from '@pkg/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchPurchaseOrderPreviewBlob, purchaseOrderPreviewUrl } from './purchase-order-pdf.js';

const PURCHASE_ORDER_ID = '44444444-4444-4444-8444-444444444444' as UUID;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('purchase order PDF urls', () => {
  it('addresses the API origin rather than the web origin serving the app', () => {
    stubClientConfig();

    expect(purchaseOrderPreviewUrl(PURCHASE_ORDER_ID)).toBe(
      'http://localhost:7002/api/purchase-orders/44444444-4444-4444-8444-444444444444/preview',
    );
  });
});

describe('fetchPurchaseOrderPreviewBlob', () => {
  it('carries the session cookie, which a cross-origin request drops by default', async () => {
    stubClientConfig();
    const fetcher = vi.fn(async () => new Response('pdf', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(fetchPurchaseOrderPreviewBlob({ purchaseOrderId: PURCHASE_ORDER_ID })).resolves.toBeInstanceOf(Blob);
    expect(fetcher).toHaveBeenCalledWith(purchaseOrderPreviewUrl(PURCHASE_ORDER_ID), { credentials: 'include' });
  });

  it("rejects with the API's own message so the sheet can explain the refusal", async () => {
    stubClientConfig();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'This Purchase Order has no lines.' }), {
            headers: { 'content-type': 'application/json' },
            status: 400,
          }),
      ),
    );

    await expect(fetchPurchaseOrderPreviewBlob({ purchaseOrderId: PURCHASE_ORDER_ID })).rejects.toThrow(
      'This Purchase Order has no lines.',
    );
  });
});

function stubClientConfig(): void {
  vi.stubGlobal('window', {
    __APP_CONFIG__: {
      appBaseUrl: 'http://localhost:7001',
      appEnv: 'development',
      apiBaseUrl: 'http://localhost:7002',
      authBaseUrl: 'http://localhost:7002/api/auth',
      docsBaseUrl: 'http://localhost:7006',
    },
  });
}

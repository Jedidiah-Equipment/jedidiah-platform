import type { UUID } from '@pkg/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ensurePurchaseOrderPreview,
  purchaseOrderDocumentDownloadUrl,
  purchaseOrderPreviewUrl,
} from './purchase-order-pdf.js';

const PURCHASE_ORDER_ID = '44444444-4444-4444-8444-444444444444' as UUID;
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555' as UUID;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('purchase order PDF urls', () => {
  it('addresses the API origin rather than the web origin serving the app', () => {
    stubClientConfig();

    expect(purchaseOrderPreviewUrl(PURCHASE_ORDER_ID)).toBe(
      'http://localhost:7002/api/purchase-orders/44444444-4444-4444-8444-444444444444/preview',
    );
    expect(purchaseOrderDocumentDownloadUrl(PURCHASE_ORDER_ID, DOCUMENT_ID)).toBe(
      'http://localhost:7002/api/purchase-orders/44444444-4444-4444-8444-444444444444/documents/55555555-5555-4555-8555-555555555555/download',
    );
  });
});

describe('ensurePurchaseOrderPreview', () => {
  it('resolves only after the PDF response succeeds', async () => {
    const fetcher = vi.fn(async () => new Response('pdf', { status: 200 }));

    await expect(ensurePurchaseOrderPreview('/preview', fetcher)).resolves.toBeUndefined();
  });

  it('carries the session cookie, which a cross-origin request drops by default', async () => {
    const fetcher = vi.fn(async () => new Response('pdf', { status: 200 }));

    await ensurePurchaseOrderPreview('/preview', fetcher);

    expect(fetcher).toHaveBeenCalledWith('/preview', { credentials: 'include' });
  });

  it('rejects an unsuccessful PDF response', async () => {
    const fetcher = vi.fn(async () => new Response('no preview', { status: 500 }));

    await expect(ensurePurchaseOrderPreview('/preview', fetcher)).rejects.toThrow('status 500');
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

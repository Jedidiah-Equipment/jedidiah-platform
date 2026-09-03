import type { UUID } from '@pkg/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchProductBrochurePreviewBlob } from './brochure.js';

const PRODUCT_ID = '22222222-2222-2222-8222-222222222222' as UUID;
const APP_CONFIG = {
  __APP_CONFIG__: {
    appBaseUrl: 'http://localhost:7001',
    appEnv: 'development',
    apiBaseUrl: 'http://localhost:7002',
    authBaseUrl: 'http://localhost:7002/api/auth',
    docsBaseUrl: 'http://localhost:7006',
  },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('brochure utilities', () => {
  it('fetches the generated brochure preview PDF with credentials and abort signal', async () => {
    const signal = new AbortController().signal;
    const previewBlob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    const fetchMock = vi.fn(async () => new Response(previewBlob));

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', APP_CONFIG);

    await expect(fetchProductBrochurePreviewBlob({ productId: PRODUCT_ID, signal })).resolves.toBeInstanceOf(Blob);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7002/api/products/22222222-2222-2222-8222-222222222222/brochure-preview',
      {
        credentials: 'include',
        signal,
      },
    );
  });

  it('surfaces the API error message when preview generation fails', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ message: 'Brochure is incomplete.' }), { status: 400 }),
    );

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', APP_CONFIG);

    await expect(fetchProductBrochurePreviewBlob({ productId: PRODUCT_ID })).rejects.toThrow('Brochure is incomplete.');
  });
});

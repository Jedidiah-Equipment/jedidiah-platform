import type { UUID } from '@pkg/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadProductBrochure, fetchProductBrochurePreviewBlob } from './brochure.js';

const PRODUCT_ID = '22222222-2222-2222-8222-222222222222' as UUID;
const APP_CONFIG = {
  __APP_CONFIG__: {
    appBaseUrl: 'http://localhost:7001',
    appEnv: 'development',
    apiBaseUrl: 'http://localhost:7002',
    authBaseUrl: 'http://localhost:7002/api/auth',
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

  it('downloads the generated brochure and revokes the object URL after the click is queued', async () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const fetchMock = vi.fn(async () => new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' })));
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:brochure-preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      ...APP_CONFIG,
      document: {
        createElement: vi.fn(() => ({
          click,
          download: '',
          href: '',
        })),
      },
    });

    await downloadProductBrochure(PRODUCT_ID);

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:brochure-preview');
  });
});

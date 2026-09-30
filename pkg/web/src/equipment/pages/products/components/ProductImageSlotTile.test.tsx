// @vitest-environment jsdom
import { EntityFile } from '@pkg/schema';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/equipment/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateProducts: async () => {} }),
}));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));

import { ProductImageSlotTile } from './ProductImageSlotTile.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
const request = vi.fn<(url: string, options: RequestInit) => Promise<Response>>();
beforeEach(() => {
  window.__APP_CONFIG__ = {
    appEnv: 'development',
    appBaseUrl: 'http://localhost:7201',
    apiBaseUrl: 'http://localhost:7202',
    authBaseUrl: 'http://localhost:7202/api/auth',
    docsBaseUrl: null,
    deploymentVersion: null,
    posthog: { enabled: false, apiHost: '/info', uiHost: 'https://us.posthog.com', release: null },
  };
  vi.stubGlobal('fetch', request);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:protected-image');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  request.mockReset();
});
async function mount(image: EntityFile | null = null, canEdit = true) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProductImageSlotTile
          canEdit={canEdit}
          description="Wide brochure banner. Center-cropped to fill."
          image={image}
          label="Banner image"
          productId="123e4567-e89b-42d3-a456-426614174000"
          slot="banner"
          usage={['brochure']}
        />
      </QueryClientProvider>,
    ),
  );
}
async function select(file?: File) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Missing image input');
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

it('rejects invalid images, uploads a valid choice immediately, and blocks pending replacements', async () => {
  request.mockImplementation(() => new Promise(() => {}));
  await mount();
  await select(new File(['pdf'], 'wrong.pdf', { type: 'application/pdf' }));
  expect(document.querySelector('[role=alert]')?.textContent).toContain('Only PNG or JPEG');
  expect(request).not.toHaveBeenCalled();
  await select();
  expect(request).not.toHaveBeenCalled();
  const file = new File(['png'], 'banner.png', { type: 'image/png' });
  await select(file);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  expect(request).toHaveBeenCalledOnce();
  const call = request.mock.calls[0];
  if (!call) throw new Error('Missing image request');
  const [url, options] = call;
  expect(url).toContain('/images/banner');
  expect((options.body as FormData).get('file')).toBe(file);
  expect(options.credentials).toBe('include');
  expect(document.querySelector<HTMLInputElement>('input[type=file]')?.disabled).toBe(true);
  await select(file);
  expect(request).toHaveBeenCalledOnce();
});

it('previews stored images through the credentialed endpoint and preserves the banner ratio', async () => {
  request.mockResolvedValue({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) } as Response);
  await mount(
    EntityFile.parse({ byteSize: 3, contentType: 'image/png', updatedAt: '2026-09-30T10:00:00.000Z' }),
    false,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const call = request.mock.calls[0];
  if (!call) throw new Error('Missing image request');
  const [url, options] = call;
  expect(url).toContain('/images/banner/download');
  expect(options.credentials).toBe('include');
  const enlarge = document.querySelector<HTMLButtonElement>('button[aria-label="Enlarge banner image"]');
  if (!enlarge) throw new Error('Missing protected preview');
  expect(enlarge.style.aspectRatio).toBe('30 / 11');
  await act(async () => enlarge.click());
  expect(document.querySelector('img[alt="Enlarged banner image"]')?.getAttribute('src')).toBe('blob:protected-image');
  expect(request).toHaveBeenCalledOnce();
  expect(document.querySelector<HTMLInputElement>('input[type=file]')?.disabled).toBe(true);
});

// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const showMutationError = vi.fn();
const { saveBlobAsFile } = vi.hoisted(() => ({ saveBlobAsFile: vi.fn() }));

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => showMutationError }));
vi.mock('@/utils/download.js', () => ({ saveBlobAsFile }));

import { FilePreviewSheet } from './FilePreviewSheet.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pdfBlob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
const mounted: Array<{ container: HTMLDivElement; root: ReturnType<typeof createRoot> }> = [];

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted.length = 0;
  showMutationError.mockClear();
  saveBlobAsFile.mockClear();
  vi.unstubAllGlobals();
});

describe('FilePreviewSheet', () => {
  // jsdom gives an iframe its own browsing context and then refuses it storage, so the inline branch
  // is exercised through the image kind — the object-URL lifecycle either side of it is the same one.
  it('renders the fetched file and downloads the bytes it is showing', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchBlob = vi.fn(async () => pdfBlob);

    await render({ fetchBlob, kind: 'image' });

    expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:http://localhost/preview');
    // One fetch serves both the preview and the download; asking again could hand back a different PDF.
    await click('Download');
    expect(fetchBlob).toHaveBeenCalledOnce();
    expect(saveBlobAsFile).toHaveBeenCalledWith({ blob: pdfBlob, filename: 'PO-00027.pdf' });
  });

  it('offers the download alone for a file it cannot render inline', async () => {
    const fetchBlob = vi.fn(async () => pdfBlob);

    await render({ fetchBlob, kind: null });

    expect(document.body.textContent).toContain('cannot be previewed');
    expect(document.querySelector('iframe')).toBeNull();
    // Nothing was fetched to show, so the download is what fetches.
    expect(fetchBlob).not.toHaveBeenCalled();
    await click('Download');
    expect(saveBlobAsFile).toHaveBeenCalledWith({ blob: pdfBlob, filename: 'PO-00027.pdf' });
  });

  it('says so when the file cannot be fetched, rather than showing an empty frame', async () => {
    const fetchBlob = vi.fn(async () => {
      throw new Error('nope');
    });

    await render({ fetchBlob, kind: 'pdf' });

    expect(document.body.textContent).toContain('Unable to preview this Purchase Order');
  });
});

async function render({
  fetchBlob,
  kind,
}: {
  fetchBlob: () => Promise<Blob>;
  kind: 'image' | 'pdf' | null;
}): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ container, root });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <FilePreviewSheet
          downloadFilename="PO-00027.pdf"
          fetchBlob={fetchBlob}
          kind={kind}
          onOpenChange={() => undefined}
          open
          queryKey={['file-preview-test', kind]}
          subject="Purchase Order"
          title="PO-00027.pdf"
        />
      </QueryClientProvider>,
    );
  });

  // The fetch resolves, then an effect turns the blob into an object URL: both land after the render.
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function click(label: string): Promise<void> {
  const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`No "${label}" button rendered.`);
  await act(async () => button.click());
}

import { DocumentSummary, type UUID } from '@pkg/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDocumentDownloadPath,
  downloadDocument,
  fetchDocumentPreviewBlob,
  getDocumentPreviewKind,
  getReadyProductDocumentUpload,
  uploadProductDocument,
} from './document.js';

const APP_CONFIG = {
  __APP_CONFIG__: {
    appBaseUrl: 'http://localhost:7001',
    appEnv: 'development',
    apiBaseUrl: 'http://localhost:7002',
    authBaseUrl: 'http://localhost:7002/api/auth',
  },
};

const documentSummary = DocumentSummary.parse({
  byteSize: 128,
  contentType: 'application/pdf',
  createdAt: '2026-06-02T10:00:00.000Z',
  filename: 'Part Book.pdf',
  id: '11111111-1111-1111-8111-111111111111',
  jobId: null,
  metadata: { type: 'part_book' },
  ownerType: 'product',
  productId: '22222222-2222-2222-8222-222222222222',
  quoteId: null,
  sourceProductId: null,
  uploaderEmail: 'test@example.com',
  uploaderName: 'Test User',
  uploaderUserId: 'test-user-id',
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('document utilities', () => {
  it('builds the product-scoped document download path', () => {
    expect(
      createDocumentDownloadPath({
        document: documentSummary,
        owner: {
          id: '22222222-2222-2222-8222-222222222222' as UUID,
          type: 'product',
        },
      }),
    ).toBe(
      '/api/products/22222222-2222-2222-8222-222222222222/documents/11111111-1111-1111-8111-111111111111/download',
    );
  });

  it('builds the job-scoped document download path', () => {
    expect(
      createDocumentDownloadPath({
        document: documentSummary,
        owner: {
          id: '33333333-3333-3333-8333-333333333333' as UUID,
          type: 'job',
        },
      }),
    ).toBe('/api/jobs/33333333-3333-3333-8333-333333333333/documents/11111111-1111-1111-8111-111111111111/download');
  });

  it('builds the quote-scoped document download path', () => {
    expect(
      createDocumentDownloadPath({
        document: documentSummary,
        owner: {
          id: '44444444-4444-4444-8444-444444444444' as UUID,
          type: 'quote',
        },
      }),
    ).toBe('/api/quotes/44444444-4444-4444-8444-444444444444/documents/11111111-1111-1111-8111-111111111111/download');
  });

  it('classifies supported preview content types', () => {
    expect(getDocumentPreviewKind({ contentType: 'application/pdf' })).toBe('pdf');
    expect(getDocumentPreviewKind({ contentType: 'image/png' })).toBe('image');
    expect(getDocumentPreviewKind({ contentType: 'image/jpeg' })).toBe('image');
    expect(getDocumentPreviewKind({ contentType: 'image/webp' })).toBe('image');
  });

  it('returns null for unsupported preview content types', () => {
    expect(getDocumentPreviewKind({ contentType: 'text/plain' })).toBeNull();
  });

  it('treats an upload as incomplete until both a file and a type are chosen', () => {
    const file = new File(['%PDF-1.7'], 'Part Book.pdf', { type: 'application/pdf' });

    expect(getReadyProductDocumentUpload({ file: null, type: null })).toBeNull();
    expect(getReadyProductDocumentUpload({ file, type: null })).toBeNull();
    expect(getReadyProductDocumentUpload({ file: null, type: 'part_book' })).toBeNull();
    expect(getReadyProductDocumentUpload({ file, type: 'part_book' })).toEqual({ file, type: 'part_book' });
  });

  it('sends the selected type alongside the file when uploading', async () => {
    const file = new File(['%PDF-1.7'], 'Standard Procedure.pdf', { type: 'application/pdf' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(documentSummary), { status: 201 }));

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', APP_CONFIG);

    await uploadProductDocument('22222222-2222-2222-8222-222222222222' as UUID, { file, type: 'sop' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:7002/api/products/22222222-2222-2222-8222-222222222222/documents');
    expect(init.method).toBe('POST');
    const body = init.body as FormData;
    expect(body.get('type')).toBe('sop');
    expect(body.get('file')).toBeInstanceOf(File);
    expect((body.get('file') as File).name).toBe('Standard Procedure.pdf');
  });

  it('passes the abort signal to preview fetch requests', async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn(async () => new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' })));

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      __APP_CONFIG__: {
        appBaseUrl: 'http://localhost:7001',
        appEnv: 'development',
        apiBaseUrl: 'http://localhost:7002',
        authBaseUrl: 'http://localhost:7002/api/auth',
      },
    });

    await fetchDocumentPreviewBlob({
      document: documentSummary,
      owner: {
        id: '22222222-2222-2222-8222-222222222222' as UUID,
        type: 'product',
      },
      signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7002/api/products/22222222-2222-2222-8222-222222222222/documents/11111111-1111-1111-8111-111111111111/download',
      {
        credentials: 'include',
        signal,
      },
    );
  });

  it('keeps the object URL alive until after the download click is queued', async () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const fetchMock = vi.fn(async () => new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' })));
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:document-download');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      __APP_CONFIG__: {
        appBaseUrl: 'http://localhost:7001',
        appEnv: 'development',
        apiBaseUrl: 'http://localhost:7002',
        authBaseUrl: 'http://localhost:7002/api/auth',
      },
      document: {
        createElement: vi.fn(() => ({
          click,
          download: '',
          href: '',
        })),
      },
    });

    await downloadDocument({
      document: documentSummary,
      owner: {
        id: '22222222-2222-2222-8222-222222222222' as UUID,
        type: 'product',
      },
    });

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:document-download');
  });
});

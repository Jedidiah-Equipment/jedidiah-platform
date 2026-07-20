import { DocumentSummary, type DocumentSummary as DocumentSummaryModel } from '@pkg/schema';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DocumentCardList } from './DocumentCardList.js';

vi.mock('@/lib/app-config.js', () => ({
  getClientConfig: () => ({
    apiBaseUrl: 'http://localhost:7002',
  }),
}));

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorToast: () => vi.fn(),
}));

describe('DocumentCardList', () => {
  it('decides the delete affordance for each document', () => {
    const purchaseOrder = buildDocument({
      filename: 'PO-123.pdf',
      id: '11111111-1111-4111-8111-111111111111',
      metadata: { type: 'purchase_order' },
    });
    const brochure = buildDocument({
      filename: 'Brochure.pdf',
      id: '22222222-2222-4222-8222-222222222222',
      metadata: { type: 'brochure' },
    });
    const queryClient = new QueryClient();
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <DocumentCardList
          canDelete={(document) => document.metadata.type === 'purchase_order'}
          documents={[purchaseOrder, brochure]}
          emptyMessage="No documents."
          isLoading={false}
          metadata={{ getSearchText: () => '', render: () => null }}
          owner={{ id: '33333333-3333-4333-8333-333333333333', type: 'job' }}
          onDelete={() => undefined}
        />
      </QueryClientProvider>,
    );

    expect(markup).toContain('aria-label="Delete PO-123.pdf"');
    expect(markup).not.toContain('aria-label="Delete Brochure.pdf"');
  });
});

function buildDocument(
  overrides: Partial<Record<keyof DocumentSummaryModel, unknown>> = {},
): DocumentSummaryModel & { metadata: { type: string } } {
  return DocumentSummary.parse({
    byteSize: 1024,
    contentType: 'application/pdf',
    createdAt: '2026-07-16T10:00:00.000Z',
    filename: 'document.pdf',
    id: crypto.randomUUID(),
    jobId: crypto.randomUUID(),
    metadata: { type: 'part_book' },
    ownerType: 'job',
    productId: null,
    quoteId: null,
    sourceProductId: null,
    uploaderEmail: 'uploader@example.com',
    uploaderName: 'Uploader',
    uploaderUserId: 'auth-user-id',
    ...overrides,
  }) as DocumentSummaryModel & { metadata: { type: string } };
}

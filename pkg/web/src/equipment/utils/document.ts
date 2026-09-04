import { formatBytes } from '@pkg/domain';
import { getDocumentPolicy } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import {
  type DocumentOwnerType,
  type DocumentSummary,
  JobDocument,
  ProductDocument,
  type ProductDocumentType,
  PurchaseOrderDocumentRow,
} from '@pkg/schema/equipment';
import { toast } from 'sonner';

import { getClientConfig } from '@/lib/app-config.js';
import { saveBlobAsFile } from '@/utils/download.js';

export const PRODUCT_DOCUMENT_ACCEPT = [...getDocumentPolicy('product').allowedContentTypes, '.zip'].join(',');
export const JOB_DOCUMENT_ACCEPT = getDocumentPolicy('job').allowedContentTypes.join(',');

export type DocumentPreviewOwner = {
  id: UUID;
  type: DocumentOwnerType;
};

/** All a preview needs of a filed document — the Purchase Order's own row shape satisfies it too. */
export type PreviewableDocument = Pick<DocumentSummary, 'byteSize' | 'contentType' | 'filename' | 'id'>;

export type DocumentPreviewKind = 'image' | 'pdf';

export function validateSelectedFile(file: File | null, ownerType: DocumentOwnerType = 'product'): File | null {
  if (!file) return null;

  const policy = getDocumentPolicy(ownerType);

  if (file.size > policy.maxBytes) {
    toast.error(`Document must be ${formatBytes(policy.maxBytes)} or smaller.`);
    return null;
  }

  return file;
}

export type ProductDocumentUploadDraft = {
  file: File | null;
  type: ProductDocumentType | null;
};

export type ReadyProductDocumentUpload = {
  file: File;
  type: ProductDocumentType;
};

export function getReadyProductDocumentUpload(draft: ProductDocumentUploadDraft): ReadyProductDocumentUpload | null {
  if (!draft.file || !draft.type) {
    return null;
  }

  return { file: draft.file, type: draft.type };
}

/**
 * One multipart upload: post the form, read the API's own message out of a failure, and parse the
 * row it returns. Every upload on this page differs only in its path, its fields and what it parses.
 */
async function postDocumentUpload<T>({
  fallbackMessage,
  fields = {},
  file,
  path,
  schema,
}: {
  fallbackMessage: string;
  fields?: Record<string, string>;
  file: File;
  path: string;
  schema: { parse: (value: unknown) => T };
}): Promise<T> {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.append(name, value);
  formData.append('file', file);

  const response = await fetch(`${getClientConfig().apiBaseUrl}${path}`, {
    body: formData,
    credentials: 'include',
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, fallbackMessage));
  }

  return schema.parse(await response.json());
}

export async function uploadProductDocument(
  productId: UUID,
  upload: ReadyProductDocumentUpload,
): Promise<ProductDocument> {
  return postDocumentUpload({
    fallbackMessage: 'Unable to upload document.',
    fields: { type: upload.type },
    file: upload.file,
    path: `/api/products/${productId}/documents`,
    schema: ProductDocument,
  });
}

/**
 * Files a supplier credit against an order, naming the returns it settles. The settlement rides the
 * same multipart request as the file so a credit note can never land without its reference (spec §4).
 */
export async function uploadCreditNote({
  file,
  purchaseOrderId,
  stockMovementIds,
}: {
  file: File;
  purchaseOrderId: UUID;
  stockMovementIds: readonly UUID[];
}): Promise<PurchaseOrderDocumentRow> {
  return postDocumentUpload({
    fallbackMessage: 'Unable to upload credit note.',
    fields: { stockMovementIds: JSON.stringify(stockMovementIds) },
    file,
    path: `/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/credit-notes`,
    schema: PurchaseOrderDocumentRow,
  });
}

/**
 * Files the Supplier's bill against an order. The AI read of it happens server-side during this
 * request, and an unreadable invoice still uploads — the panel says so rather than failing here.
 */
export async function uploadSupplierInvoice({
  file,
  purchaseOrderId,
}: {
  file: File;
  purchaseOrderId: UUID;
}): Promise<PurchaseOrderDocumentRow> {
  return postDocumentUpload({
    fallbackMessage: 'Unable to upload this Supplier invoice.',
    file,
    path: `/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/supplier-invoices`,
    schema: PurchaseOrderDocumentRow,
  });
}

export async function uploadJobPurchaseOrder(jobId: UUID, file: File): Promise<JobDocument> {
  return postDocumentUpload({
    fallbackMessage: 'Unable to upload Purchase Order.',
    file,
    path: `/api/jobs/${jobId}/documents`,
    schema: JobDocument,
  });
}

export async function downloadProductDocument(productId: UUID, document: DocumentSummary): Promise<void> {
  await downloadDocument({ document, owner: { id: productId, type: 'product' } });
}

export async function downloadJobDocument(jobId: UUID, document: DocumentSummary): Promise<void> {
  await downloadDocument({ document, owner: { id: jobId, type: 'job' } });
}

export async function downloadQuoteDocument(quoteId: UUID, document: DocumentSummary): Promise<void> {
  await downloadDocument({ document, owner: { id: quoteId, type: 'quote' } });
}

export async function downloadDocument({
  document,
  owner,
}: {
  document: DocumentSummary;
  owner: DocumentPreviewOwner;
}): Promise<void> {
  const response = await fetch(getDocumentDownloadUrl({ document, owner }), {
    credentials: 'include',
  });

  await downloadDocumentResponse({ document, fallback: 'Unable to download document.', response });
}

export async function fetchDocumentPreviewBlob({
  document,
  owner,
  signal,
}: {
  document: Pick<PreviewableDocument, 'id'>;
  owner: DocumentPreviewOwner;
  signal?: AbortSignal;
}): Promise<Blob> {
  const requestInit: RequestInit = {
    credentials: 'include',
    ...(signal ? { signal } : {}),
  };
  const response = await fetch(getDocumentDownloadUrl({ document, owner }), requestInit);

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to preview document.'));
  }

  return response.blob();
}

export function getDocumentDownloadUrl({
  document,
  owner,
}: {
  document: Pick<PreviewableDocument, 'id'>;
  owner: DocumentPreviewOwner;
}): string {
  return `${getClientConfig().apiBaseUrl}${createDocumentDownloadPath({ document, owner })}`;
}

export function createDocumentDownloadPath({
  document,
  owner,
}: {
  document: Pick<PreviewableDocument, 'id'>;
  owner: DocumentPreviewOwner;
}): string {
  const encodedOwnerId = encodeURIComponent(owner.id);
  const encodedDocumentId = encodeURIComponent(document.id);

  if (owner.type === 'product') {
    return `/api/products/${encodedOwnerId}/documents/${encodedDocumentId}/download`;
  }

  if (owner.type === 'job') {
    return `/api/jobs/${encodedOwnerId}/documents/${encodedDocumentId}/download`;
  }

  if (owner.type === 'purchase_order') {
    return `/api/purchase-orders/${encodedOwnerId}/documents/${encodedDocumentId}/download`;
  }

  return `/api/quotes/${encodedOwnerId}/documents/${encodedDocumentId}/download`;
}

export function getDocumentPreviewKind(document: Pick<DocumentSummary, 'contentType'>): DocumentPreviewKind | null {
  const contentType = document.contentType.toLowerCase();

  if (contentType === 'application/pdf') {
    return 'pdf';
  }

  if (['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    return 'image';
  }

  return null;
}

async function downloadDocumentResponse({
  document,
  fallback,
  response,
}: {
  document: DocumentSummary;
  fallback: string;
  response: Response;
}): Promise<void> {
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, fallback));
  }

  saveBlobAsFile({ blob: await response.blob(), filename: document.filename });
}

export async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };

    return typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback;
  } catch {
    return fallback;
  }
}

import { formatBytes, getDocumentPolicy } from '@pkg/domain';
import { DocumentMetadata, type UUID } from '@pkg/schema';
import { toast } from 'sonner';

import { getClientConfig } from '@/lib/app-config.js';

export const PRODUCT_DOCUMENT_ACCEPT = getDocumentPolicy('product').allowedContentTypes.join(',');

export type DocumentPreviewOwner = {
  id: UUID;
  type: 'job' | 'product';
};

export type DocumentPreviewKind = 'image' | 'pdf';

export function validateSelectedFile(file: File | null): File | null {
  if (!file) return null;

  const policy = getDocumentPolicy('product');

  if (file.size > policy.maxBytes) {
    toast.error(`Document must be ${formatBytes(policy.maxBytes)} or smaller.`);
    return null;
  }

  return file;
}

export async function uploadProductDocument(productId: UUID, file: File): Promise<DocumentMetadata> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${getClientConfig().apiBaseUrl}/api/products/${productId}/documents`, {
    body: formData,
    credentials: 'include',
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to upload document.'));
  }

  return DocumentMetadata.parse(await response.json());
}

export async function downloadProductDocument(productId: UUID, document: DocumentMetadata): Promise<void> {
  await downloadDocument({ document, owner: { id: productId, type: 'product' } });
}

export async function downloadJobDocument(jobId: UUID, document: DocumentMetadata): Promise<void> {
  await downloadDocument({ document, owner: { id: jobId, type: 'job' } });
}

export async function downloadDocument({
  document,
  owner,
}: {
  document: DocumentMetadata;
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
  document: DocumentMetadata;
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
  document: DocumentMetadata;
  owner: DocumentPreviewOwner;
}): string {
  return `${getClientConfig().apiBaseUrl}${createDocumentDownloadPath({ document, owner })}`;
}

export function createDocumentDownloadPath({
  document,
  owner,
}: {
  document: DocumentMetadata;
  owner: DocumentPreviewOwner;
}): string {
  const encodedOwnerId = encodeURIComponent(owner.id);
  const encodedDocumentId = encodeURIComponent(document.id);

  if (owner.type === 'product') {
    return `/api/products/${encodedOwnerId}/documents/${encodedDocumentId}/download`;
  }

  return `/api/jobs/${encodedOwnerId}/documents/${encodedDocumentId}/download`;
}

export function getDocumentPreviewKind(document: Pick<DocumentMetadata, 'contentType'>): DocumentPreviewKind | null {
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
  document: DocumentMetadata;
  fallback: string;
  response: Response;
}): Promise<void> {
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, fallback));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = document.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };

    return typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback;
  } catch {
    return fallback;
  }
}

import { formatBytes, getDocumentPolicy } from '@pkg/domain';
import { DocumentMetadata, type UUID } from '@pkg/schema';
import { toast } from 'sonner';

import { getClientConfig } from '@/lib/app-config.js';

export const PRODUCT_DOCUMENT_ACCEPT = getDocumentPolicy('product').allowedContentTypes.join(',');

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
  const response = await fetch(
    `${getClientConfig().apiBaseUrl}/api/products/${productId}/documents/${document.id}/download`,
    {
      credentials: 'include',
    },
  );

  await downloadDocumentResponse({ document, fallback: 'Unable to download document.', response });
}

export async function downloadJobDocument(jobId: UUID, document: DocumentMetadata): Promise<void> {
  const response = await fetch(`${getClientConfig().apiBaseUrl}/api/jobs/${jobId}/documents/${document.id}/download`, {
    credentials: 'include',
  });

  await downloadDocumentResponse({ document, fallback: 'Unable to download document.', response });
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
  URL.revokeObjectURL(url);
}

export async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };

    return typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback;
  } catch {
    return fallback;
  }
}

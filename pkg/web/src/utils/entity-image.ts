import { imageContentTypeRejectedMessage, imageTooLargeMessage } from '@pkg/domain';
import { IMAGE_CONTENT_TYPES } from '@pkg/schema';
import { toast } from 'sonner';

import { readApiErrorMessage } from './document.js';

// Shared client-side plumbing for entities that store images in private object storage (brochure slots,
// Product Range image). Each entity composes a thin wrapper on top: its own upload/download URL and the
// Zod schema that parses the replace response. Keep entity specifics out of here.

const ALLOWED_CONTENT_TYPES = new Set<string>(IMAGE_CONTENT_TYPES);

// Client-side guard mirroring the server policy so an obviously wrong file is rejected before upload.
// The server re-validates by sniffing the bytes, so this is UX only. Returns the file when acceptable,
// otherwise toasts the reason and returns null.
export function validateSelectedImage(file: File | null, maxBytes: number): File | null {
  if (!file) return null;

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    toast.error(imageContentTypeRejectedMessage(IMAGE_CONTENT_TYPES));
    return null;
  }

  if (file.size > maxBytes) {
    toast.error(imageTooLargeMessage(maxBytes));
    return null;
  }

  return file;
}

// Replace the image at `uploadUrl` in place, returning the parsed JSON body (the updated owner). Callers
// validate the shape against their entity schema.
export async function uploadImageMultipart(uploadUrl: string, file: File): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(uploadUrl, {
    body: formData,
    credentials: 'include',
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to upload image.'));
  }

  return response.json();
}

// Fetch an entity image as a credentialed blob (the bytes live behind an authed download route).
export async function fetchCredentialedImageBlob(downloadUrl: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(downloadUrl, {
    credentials: 'include',
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to load image.'));
  }

  return response.blob();
}

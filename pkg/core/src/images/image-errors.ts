import type { ImagePolicyViolationCode } from '@pkg/domain';

// Errors for the generic image service, shared by every entity that stores uploaded images. Owner-not
// -found (e.g. a missing Product) stays an entity-specific error raised by the binding; these cover only
// the image concerns the generic service owns.
export class ImagePolicyViolationError extends Error {
  readonly code: ImagePolicyViolationCode;

  constructor(violation: { code: ImagePolicyViolationCode; message: string }) {
    super(violation.message);
    this.name = 'ImagePolicyViolationError';
    this.code = violation.code;
  }
}

export class ImageNotFoundError extends Error {
  readonly code = 'image.not_found';
  readonly metadata: Record<string, string>;

  constructor(message: string, metadata: Record<string, string> = {}) {
    super(message);
    this.name = 'ImageNotFoundError';
    this.metadata = metadata;
  }
}

export type ImageCoreError = ImageNotFoundError | ImagePolicyViolationError;

export function isImageCoreError(error: unknown): error is ImageCoreError {
  return error instanceof ImageNotFoundError || error instanceof ImagePolicyViolationError;
}

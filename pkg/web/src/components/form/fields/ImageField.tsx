import { describeFileContentTypes, fileTooLargeMessage } from '@pkg/domain';
import type * as React from 'react';
import { useId } from 'react';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';
import { ImageUploadControl } from './ImageUploadControl.js';

export type ImageFieldProps = {
  // Accepted MIME types, e.g. `@pkg/schema`'s `IMAGE_CONTENT_TYPES`. Drives both the `<input accept>`
  // list and the client-side type guard; the owning schema re-validates the result on submit.
  contentTypes: readonly string[];
  description?: React.ReactNode;
  disabled?: boolean;
  fallbackLabel: string;
  label: React.ReactNode;
  maxBytes: number;
  onValueCommit?: () => void;
};

// A form field for an image stored inline as a full-resolution data URL. Unlike `ThumbnailField` (which
// crops and re-encodes to a small avatar), this keeps the picked file as-is, gated only by `accept` and
// `maxBytes` — suitable for presentation images that need their original resolution.
export function ImageField({
  contentTypes,
  description,
  disabled = false,
  fallbackLabel,
  label,
  maxBytes,
  onValueCommit,
}: ImageFieldProps) {
  const field = useFieldContext<string | null>();
  const inputId = useId();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <ImageUploadControl
        accept={contentTypes.join(',')}
        disabled={disabled}
        errorFallbackMessage="Unable to read image."
        fallbackLabel={fallbackLabel}
        inputId={inputId}
        isInvalid={isInvalid}
        onBlur={field.handleBlur}
        onChange={(value) => {
          field.handleChange(value);
          onValueCommit?.();
        }}
        removeLabel="Remove image"
        replaceLabel="Replace"
        transform={(file) => readImageFileAsDataUrl(file, contentTypes, maxBytes)}
        uploadLabel="Upload"
        value={field.state.value}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={fieldErrors} />
    </Field>
  );
}

async function readImageFileAsDataUrl(file: File, contentTypes: readonly string[], maxBytes: number): Promise<string> {
  if (contentTypes.length > 0 && !contentTypes.includes(file.type)) {
    throw new Error(`Image must be a ${describeFileContentTypes(contentTypes)}.`);
  }

  if (file.size > maxBytes) {
    throw new Error(fileTooLargeMessage(maxBytes));
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read image.'));
      }
    });
    reader.addEventListener('error', () => reject(new Error('Unable to read image.')));
    reader.readAsDataURL(file);
  });
}

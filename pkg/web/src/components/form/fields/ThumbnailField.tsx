import type * as React from 'react';
import { useId } from 'react';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';
import { ImageUploadControl } from './ImageUploadControl.js';

const THUMBNAIL_SIZE = 256;
const THUMBNAIL_TYPE = 'image/webp';
const THUMBNAIL_QUALITY = 0.86;

export type ThumbnailFieldProps = {
  description?: React.ReactNode;
  disabled?: boolean;
  fallbackLabel: string;
  label: React.ReactNode;
  onValueCommit?: () => void;
};

export function ThumbnailField({
  description,
  disabled = false,
  fallbackLabel,
  label,
  onValueCommit,
}: ThumbnailFieldProps) {
  const field = useFieldContext<string | null>();
  const inputId = useId();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <ImageUploadControl
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        errorFallbackMessage="Unable to process thumbnail."
        fallbackLabel={fallbackLabel}
        inputId={inputId}
        isInvalid={isInvalid}
        onBlur={field.handleBlur}
        onChange={(value) => {
          field.handleChange(value);
          onValueCommit?.();
        }}
        removeLabel="Remove thumbnail"
        replaceLabel="Replace thumbnail"
        transform={createThumbnailDataUrl}
        trigger="thumbnail"
        uploadLabel="Upload thumbnail"
        value={field.state.value}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={fieldErrors} />
    </Field>
  );
}

async function createThumbnailDataUrl(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Unsupported thumbnail image type.');
  }

  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to process thumbnail.');
  }

  const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
  const cropX = Math.floor((image.naturalWidth - cropSize) / 2);
  const cropY = Math.floor((image.naturalHeight - cropSize) / 2);

  context.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);

  const dataUrl = canvas.toDataURL(THUMBNAIL_TYPE, THUMBNAIL_QUALITY);

  if (dataUrl.length > 64 * 1024) {
    throw new Error('Thumbnail must be 64 KB or smaller.');
  }

  return dataUrl;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

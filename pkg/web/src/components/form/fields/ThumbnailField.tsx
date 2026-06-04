import { IconPhoto, IconTrash, IconUpload } from '@tabler/icons-react';
import type * as React from 'react';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';

import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Button } from '@/components/ui/button.js';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsProcessing(true);
    try {
      field.handleChange(await createThumbnailDataUrl(file));
      onValueCommit?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to process thumbnail.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        <EntityThumbnail label={fallbackLabel} size="lg" thumbnailDataUrl={field.state.value} />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input
            accept="image/png,image/jpeg,image/webp"
            aria-invalid={isInvalid}
            className="sr-only"
            disabled={disabled || isProcessing}
            id={inputId}
            onBlur={field.handleBlur}
            onChange={handleFileChange}
            ref={inputRef}
            type="file"
          />
          <Button
            disabled={disabled || isProcessing}
            onClick={() => inputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            {field.state.value ? <IconPhoto data-icon="inline-start" /> : <IconUpload data-icon="inline-start" />}
            {field.state.value ? 'Replace' : 'Upload'}
          </Button>
          {field.state.value ? (
            <Button
              disabled={disabled || isProcessing}
              onClick={() => {
                field.handleChange(null);
                onValueCommit?.();
              }}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <IconTrash />
              <span className="sr-only">Remove thumbnail</span>
            </Button>
          ) : null}
        </div>
      </div>
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

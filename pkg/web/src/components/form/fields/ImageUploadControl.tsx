import { IconPhoto, IconTrash, IconUpload } from '@tabler/icons-react';
import type * as React from 'react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';

export type ImageUploadControlProps = {
  accept: string;
  disabled?: boolean;
  errorFallbackMessage: string;
  fallbackLabel: string;
  inputId: string;
  isInvalid?: boolean;
  onBlur?: () => void;
  onChange: (dataUrl: string | null) => void;
  removeLabel: string;
  // Turns the picked file into the data URL stored on the field (resize, re-encode, validate, etc.).
  // Throw an `Error` to surface its message to the user as a toast.
  transform: (file: File) => Promise<string>;
  value: string | null;
};

// The shared preview + upload/replace/remove control for data-URL image fields. Owns file selection
// and the in-flight processing state; field-specific concerns (validation, encoding, the surrounding
// `Field`/label/error chrome) live in the field components that compose it.
export function ImageUploadControl({
  accept,
  disabled = false,
  errorFallbackMessage,
  fallbackLabel,
  inputId,
  isInvalid = false,
  onBlur,
  onChange,
  removeLabel,
  transform,
  value,
}: ImageUploadControlProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsProcessing(true);
    try {
      onChange(await transform(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : errorFallbackMessage);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <EntityThumbnail label={fallbackLabel} size="lg" thumbnailDataUrl={value} />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input
          accept={accept}
          aria-invalid={isInvalid}
          className="sr-only"
          disabled={disabled || isProcessing}
          id={inputId}
          onBlur={onBlur}
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
          {value ? <IconPhoto data-icon="inline-start" /> : <IconUpload data-icon="inline-start" />}
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value ? (
          <Button
            disabled={disabled || isProcessing}
            onClick={() => onChange(null)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <IconTrash />
            <span className="sr-only">{removeLabel}</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

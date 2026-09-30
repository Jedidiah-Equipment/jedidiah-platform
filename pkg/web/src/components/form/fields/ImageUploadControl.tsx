import { IconLoader2, IconRefresh, IconTrash, IconUpload } from '@tabler/icons-react';
import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
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
  replaceLabel: string;
  // Turns the picked file into the data URL stored on the field (resize, re-encode, validate, etc.).
  // Throw an `Error` to surface its message beside the field.
  transform: (file: File) => Promise<string>;
  trigger?: 'button' | 'thumbnail';
  uploadLabel: string;
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
  replaceLabel,
  transform,
  trigger = 'button',
  uploadLabel,
  value,
}: ImageUploadControlProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const processing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || disabled || processing.current) {
      return;
    }

    processing.current = true;
    setError('');
    setIsProcessing(true);
    try {
      const dataUrl = await transform(file);
      if (mounted.current) onChange(dataUrl);
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : errorFallbackMessage);
    } finally {
      processing.current = false;
      if (mounted.current) setIsProcessing(false);
    }
  }

  const fileInput = (
    <Input
      accept={accept}
      aria-invalid={isInvalid || !!error}
      aria-describedby={error ? `${inputId}-processing-error` : undefined}
      className="sr-only"
      tabIndex={-1}
      aria-label={value ? replaceLabel : uploadLabel}
      disabled={disabled || isProcessing}
      id={inputId}
      onBlur={onBlur}
      onChange={handleFileChange}
      ref={inputRef}
      type="file"
    />
  );
  const removeButton = value ? (
    <Button
      title={removeLabel}
      disabled={disabled || isProcessing}
      onClick={() => {
        setError('');
        onChange(null);
      }}
      size="icon-sm"
      type="button"
      variant="outline"
    >
      <IconTrash />
      <span className="sr-only">{removeLabel}</span>
    </Button>
  ) : null;

  return (
    <div className="min-w-0 space-y-2" aria-busy={isProcessing}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative size-10 shrink-0">
          <EntityThumbnail label={fallbackLabel} size="lg" thumbnailDataUrl={value} />
          {isProcessing ? (
            <span
              role="status"
              aria-label="Processing image"
              className="absolute inset-0 flex items-center justify-center rounded-md bg-background/80"
            >
              <IconLoader2 className="size-4 animate-spin" />
            </span>
          ) : null}
        </div>
        {fileInput}
        <Button
          aria-label={value ? replaceLabel : uploadLabel}
          aria-invalid={isInvalid || !!error}
          aria-describedby={error ? `${inputId}-processing-error` : undefined}
          title={value ? replaceLabel : uploadLabel}
          disabled={disabled || isProcessing}
          onClick={() => inputRef.current?.click()}
          size={trigger === 'thumbnail' ? 'icon-sm' : 'sm'}
          type="button"
          variant="outline"
        >
          {value ? <IconRefresh /> : <IconUpload />}
          {trigger === 'button' ? (value ? replaceLabel : uploadLabel) : null}
        </Button>
        {removeButton}
      </div>
      {error ? (
        <p id={`${inputId}-processing-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

import { describeFileContentTypes, formatBytes } from '@pkg/domain';
import {
  IconArrowsMaximize,
  IconFile,
  IconFileTypeCsv,
  IconFileTypePdf,
  IconLoader2,
  IconPhoto,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { cn } from '@/lib/utils.js';

type AttachmentFieldProps = {
  accept?: string;
  disabled?: boolean;
  error?: string;
  file: File | null;
  id?: string | undefined;
  label: string;
  onChange: (file: File | null) => void;
  pending?: boolean;
  policy: { allowedContentTypes: readonly string[]; maxBytes?: number };
};

/** Selection and draft preview only. The owner validates selections and decides when to persist. */
export function AttachmentField({
  accept,
  disabled,
  error,
  file,
  id,
  label,
  onChange,
  pending,
  policy,
}: AttachmentFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const isImage = file?.type.startsWith('image/') ?? false;
  const canPreview = file?.type === 'application/pdf' || isImage;
  const blocked = disabled || pending;

  useEffect(() => {
    if (!file || !canPreview) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, canPreview]);

  const Icon =
    isImage || (!file && policy.allowedContentTypes.every((type) => type.startsWith('image/')))
      ? IconPhoto
      : file?.type === 'application/pdf'
        ? IconFileTypePdf
        : file?.name.toLowerCase().endsWith('.csv')
          ? IconFileTypeCsv
          : IconFile;
  const media =
    file && preview && canPreview ? (
      <Dialog key={preview}>
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              disabled={blocked}
              className="relative size-14 overflow-hidden rounded-md bg-muted p-0"
              aria-label={`Enlarge ${label.toLowerCase()}`}
            />
          }
        >
          {isImage ? (
            <img src={preview} alt={`Selected ${label.toLowerCase()}`} className="h-full w-full object-contain" />
          ) : (
            <Icon className="size-5!" />
          )}
          <span className="absolute right-1 bottom-1 rounded bg-black/70 p-0.5 text-white">
            <IconArrowsMaximize className="size-3!" />
          </span>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6" title={file.name}>
              {file.name}
            </DialogTitle>
          </DialogHeader>
          {isImage ? (
            <img
              src={preview}
              alt={`Enlarged ${label.toLowerCase()}`}
              className="max-h-[70dvh] w-full object-contain"
            />
          ) : (
            <iframe src={preview} title={file.name} className="h-[70dvh] w-full rounded-md border" />
          )}
        </DialogContent>
      </Dialog>
    ) : (
      <div className="flex size-14 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-5!" />
      </div>
    );

  return (
    <Field className="min-w-0" data-invalid={!!error}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <FieldLabel htmlFor={inputId} className="text-xs">
          {label}
        </FieldLabel>
        <span className="text-[0.65rem] text-muted-foreground">
          {describeFileContentTypes(policy.allowedContentTypes)}
          {policy.maxBytes !== undefined ? ` · up to ${formatBytes(policy.maxBytes)}` : ''}
        </span>
      </div>
      <Input
        ref={input}
        id={inputId}
        tabIndex={-1}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className="sr-only"
        type="file"
        accept={accept ?? policy.allowedContentTypes.join(',')}
        disabled={blocked}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = '';
          if (selected && !blocked) onChange(selected);
        }}
      />
      <Card
        size="sm"
        aria-busy={pending}
        className={cn(
          'h-20 justify-center bg-muted/30 py-2',
          !file && 'border-dashed',
          dragging && !blocked && 'border-primary',
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (!blocked) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const selected = event.dataTransfer.files[0];
          if (selected && !blocked) onChange(selected);
        }}
      >
        <CardContent className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2">
          {pending ? (
            <div
              role="status"
              aria-label={`Processing ${label.toLowerCase()}`}
              className="flex size-14 items-center justify-center"
            >
              <IconLoader2 className="animate-spin" />
            </div>
          ) : (
            media
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-medium" title={file?.name}>
              {pending ? 'Processing…' : (file?.name ?? `Attach ${label.toLowerCase()}`)}
            </p>
            <p className="mt-1 truncate text-[0.65rem] text-muted-foreground" title={file?.type}>
              {file
                ? `${file.type || describeFileContentTypes(policy.allowedContentTypes)} · ${formatBytes(file.size)}`
                : 'Choose a file or drop it here'}
            </p>
          </div>
          {file ? (
            <div className="flex shrink-0 items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={blocked}
                aria-label={`Replace ${label.toLowerCase()}`}
                title={`Replace ${label.toLowerCase()}`}
                onClick={() => input.current?.click()}
              >
                <IconRefresh />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={blocked}
                aria-label={`Remove ${label.toLowerCase()}`}
                title={`Remove ${label.toLowerCase()}`}
                onClick={() => onChange(null)}
              >
                <IconTrash />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Choose ${label.toLowerCase()}`}
              aria-describedby={error ? `${inputId}-error` : undefined}
              disabled={blocked}
              onClick={() => input.current?.click()}
            >
              Choose
            </Button>
          )}
        </CardContent>
      </Card>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Field>
  );
}

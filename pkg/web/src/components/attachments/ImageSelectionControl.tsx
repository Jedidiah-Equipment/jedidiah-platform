import { describeFileContentTypes, type FilePolicy, formatBytes } from '@pkg/domain';
import { IconArrowsMaximize, IconLoader2, IconPhoto, IconRefresh, IconUpload } from '@tabler/icons-react';
import { useId, useRef } from 'react';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { cn } from '@/lib/utils.js';

/** Large entity-image presentation; owners keep credentialed fetching and immediate replacement. */
export function ImageSelectionControl({
  aspectRatio,
  disabled,
  error,
  fit = 'contain',
  hasImage,
  label,
  onSelect,
  pending,
  policy,
  previewUrl,
  previewPending,
}: {
  aspectRatio?: string | undefined;
  disabled: boolean;
  error: string;
  fit?: 'contain' | 'cover';
  hasImage: boolean;
  label: string;
  onSelect: (file: File) => void;
  pending: boolean;
  policy: FilePolicy;
  previewUrl: string | null;
  previewPending: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const blocked = disabled || pending;
  const image = previewUrl ? (
    <img
      alt={`${label} preview`}
      src={previewUrl}
      className={cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
    />
  ) : (
    <div className="flex flex-col items-center gap-1 text-muted-foreground">
      {previewPending ? (
        <IconLoader2 role="status" aria-label="Loading image preview" className="animate-spin" />
      ) : (
        <IconPhoto />
      )}
      <span className="text-xs">
        {previewPending ? 'Loading preview…' : hasImage ? 'Preview unavailable' : 'No image'}
      </span>
    </div>
  );
  const previewClass = cn(
    'relative flex w-full items-center justify-center overflow-hidden rounded-md border bg-muted/40',
    !aspectRatio && 'aspect-video',
  );
  return (
    <div className="min-w-0 space-y-2" aria-busy={pending || previewPending}>
      {previewUrl ? (
        <Dialog>
          <DialogTrigger
            render={
              <Button
                className={cn(previewClass, 'h-auto p-0')}
                style={aspectRatio ? { aspectRatio } : undefined}
                type="button"
                variant="ghost"
                aria-label={`Enlarge ${label.toLowerCase()}`}
              />
            }
          >
            {image}
            <span className="absolute right-2 bottom-2 rounded bg-black/70 p-1 text-white">
              <IconArrowsMaximize className="size-4!" />
            </span>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
            </DialogHeader>
            <img
              src={previewUrl}
              alt={`Enlarged ${label.toLowerCase()}`}
              className="max-h-[70dvh] w-full object-contain"
            />
          </DialogContent>
        </Dialog>
      ) : (
        <div className={previewClass} style={aspectRatio ? { aspectRatio } : undefined}>
          {image}
        </div>
      )}
      <Input
        id={id}
        tabIndex={-1}
        ref={input}
        type="file"
        className="sr-only"
        accept={policy.allowedContentTypes.join(',')}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        disabled={blocked}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file && !blocked) onSelect(file);
        }}
      />
      <Button
        className="w-full"
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={!!error}
        type="button"
        variant="outline"
        disabled={blocked}
        onClick={() => input.current?.click()}
      >
        {pending ? (
          <IconLoader2 className="animate-spin" data-icon="inline-start" />
        ) : hasImage ? (
          <IconRefresh data-icon="inline-start" />
        ) : (
          <IconUpload data-icon="inline-start" />
        )}
        {pending ? 'Uploading…' : hasImage ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
      </Button>
      <p className="text-[0.65rem] text-muted-foreground">
        {describeFileContentTypes(policy.allowedContentTypes)} · up to {formatBytes(policy.maxBytes)}
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

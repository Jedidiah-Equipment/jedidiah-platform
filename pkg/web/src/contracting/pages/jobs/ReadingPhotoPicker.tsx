import {
  describeFileContentTypes,
  fileContentTypeRejectedMessage,
  fileTooLargeMessage,
  formatBytes,
} from '@pkg/domain';
import { READING_PHOTO_POLICY } from '@pkg/domain/contracting';
import { IconArrowsMaximize, IconPhoto, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';

export function ReadingPhotoPicker({
  id,
  photo,
  onChange,
  onError,
}: {
  id: string;
  photo: File | null;
  onChange: (photo: File | null) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function selectPhoto(selected: File | undefined) {
    if (!selected) return;
    if (!(READING_PHOTO_POLICY.allowedContentTypes as readonly string[]).includes(selected.type)) {
      onChange(null);
      onError(fileContentTypeRejectedMessage(READING_PHOTO_POLICY.allowedContentTypes));
      return;
    }
    if (selected.size > READING_PHOTO_POLICY.maxBytes) {
      onChange(null);
      onError(fileTooLargeMessage(READING_PHOTO_POLICY.maxBytes));
      return;
    }
    onError('');
    onChange(selected);
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">Meter photo</span>
        <span className="text-[0.65rem] text-muted-foreground">
          {describeFileContentTypes(READING_PHOTO_POLICY.allowedContentTypes)} · up to{' '}
          {formatBytes(READING_PHOTO_POLICY.maxBytes)}
        </span>
      </div>
      <Input
        ref={input}
        id={id}
        aria-label="Meter photo"
        className="sr-only"
        type="file"
        accept={READING_PHOTO_POLICY.allowedContentTypes.join(',')}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = '';
          selectPhoto(selected);
        }}
      />
      <Card
        size="sm"
        className={`h-20 justify-center bg-muted/30 py-2 ${photo ? '' : 'border-dashed'} ${dragging ? 'border-primary' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          selectPhoto(event.dataTransfer.files[0]);
        }}
      >
        <CardContent className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2">
          {photo && preview ? (
            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted p-0"
                    aria-label="Enlarge meter photo"
                  />
                }
              >
                <img src={preview} alt="Selected hour meter" className="h-full w-full object-contain" />
                <span className="absolute right-1 bottom-1 rounded bg-black/70 p-0.5 text-white">
                  <IconArrowsMaximize className="size-3!" />
                </span>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="truncate pr-6">{photo.name}</DialogTitle>
                </DialogHeader>
                <img src={preview} alt="Enlarged hour meter" className="max-h-[70dvh] w-full object-contain" />
              </DialogContent>
            </Dialog>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="size-14 shrink-0 rounded-md bg-muted p-0 text-muted-foreground"
              aria-label="Choose meter photo"
              onClick={() => input.current?.click()}
            >
              <IconPhoto className="size-5!" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium" title={photo?.name}>
              {photo?.name ?? 'Attach meter photo'}
            </p>
            <p className="mt-1 text-[0.65rem] text-muted-foreground">
              {photo
                ? `${describeFileContentTypes([photo.type])} · ${formatBytes(photo.size)}`
                : 'Choose a file or drop it here'}
            </p>
          </div>
          {photo ? (
            <div className="flex shrink-0 items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Replace meter photo"
                title="Replace meter photo"
                onClick={() => input.current?.click()}
              >
                <IconRefresh />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove meter photo"
                title="Remove meter photo"
                onClick={() => {
                  onError('');
                  onChange(null);
                }}
              >
                <IconTrash />
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
              Choose
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import {
  describeFileContentTypes,
  fileContentTypeRejectedMessage,
  fileTooLargeMessage,
  formatBytes,
} from '@pkg/domain';
import { READING_PHOTO_POLICY } from '@pkg/domain/contracting';
import { IconPhoto, IconTrash } from '@tabler/icons-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button.js';
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

  return (
    <div className="space-y-2">
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
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          <IconPhoto data-icon="inline-start" />
          {photo ? 'Replace meter photo' : 'Attach meter photo'}
        </Button>
        {photo ? (
          <>
            <span className="max-w-48 truncate text-sm" title={photo.name}>
              {photo.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove meter photo"
              onClick={() => onChange(null)}
            >
              <IconTrash />
            </Button>
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {describeFileContentTypes(READING_PHOTO_POLICY.allowedContentTypes)}, up to{' '}
        {formatBytes(READING_PHOTO_POLICY.maxBytes)}.
      </p>
    </div>
  );
}

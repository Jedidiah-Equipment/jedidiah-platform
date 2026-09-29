import { IconPhoto, IconTrash } from '@tabler/icons-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png'];

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
        accept={PHOTO_TYPES.join(',')}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = '';
          if (!selected) return;
          if (!PHOTO_TYPES.includes(selected.type)) {
            onChange(null);
            onError('Choose a JPEG or PNG meter photo.');
            return;
          }
          if (selected.size > MAX_PHOTO_BYTES) {
            onChange(null);
            onError('Meter photo must be 10 MB or smaller.');
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
      <p className="text-xs text-muted-foreground">JPEG or PNG, up to 10 MB.</p>
    </div>
  );
}

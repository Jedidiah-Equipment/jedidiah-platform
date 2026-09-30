import { fileContentTypeRejectedMessage, fileTooLargeMessage } from '@pkg/domain';
import { READING_PHOTO_POLICY } from '@pkg/domain/contracting';
import { AttachmentField } from '@/components/attachments/AttachmentField.js';

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
  return (
    <AttachmentField
      id={id}
      label="Meter photo"
      file={photo}
      policy={READING_PHOTO_POLICY}
      onChange={(selected) => {
        if (selected && !(READING_PHOTO_POLICY.allowedContentTypes as readonly string[]).includes(selected.type)) {
          onChange(null);
          onError(fileContentTypeRejectedMessage(READING_PHOTO_POLICY.allowedContentTypes));
          return;
        }
        if (selected && selected.size > READING_PHOTO_POLICY.maxBytes) {
          onChange(null);
          onError(fileTooLargeMessage(READING_PHOTO_POLICY.maxBytes));
          return;
        }
        onError('');
        onChange(selected);
      }}
    />
  );
}

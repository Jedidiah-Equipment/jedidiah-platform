import { type FilePolicy, fileContentTypeRejectedMessage, fileTooLargeMessage } from '@pkg/domain';
import { AttachmentField } from '@/components/attachments/AttachmentField.js';

/** Whether the policy admits a browser-declared content type; the server still sniffs the bytes on upload. */
export const allowsContentType = (policy: FilePolicy, type: string) => policy.allowedContentTypes.includes(type);

/** Why the policy refuses the photo before it is uploaded, or nothing when it admits it. */
export function photoRefusal(policy: FilePolicy, photo: File): string | undefined {
  if (!allowsContentType(policy, photo.type)) return fileContentTypeRejectedMessage(policy.allowedContentTypes);
  if (photo.size > policy.maxBytes) return fileTooLargeMessage(policy.maxBytes);
  return undefined;
}

/** Picks one photo under a policy: a refused pick clears the selection and reports why; an admitted one clears the error. */
export function PhotoPicker({
  id,
  label,
  policy,
  photo,
  pending = false,
  error,
  onChange,
  onError,
}: {
  id?: string | undefined;
  label: string;
  policy: FilePolicy;
  photo: File | null;
  pending?: boolean;
  error?: string | undefined;
  onChange: (photo: File | null) => void;
  onError: (message: string) => void;
}) {
  return (
    <AttachmentField
      id={id}
      label={label}
      file={photo}
      pending={pending}
      policy={policy}
      {...(error ? { error } : {})}
      onChange={(selected) => {
        const refusal = selected ? photoRefusal(policy, selected) : undefined;
        if (refusal) {
          onChange(null);
          onError(refusal);
          return;
        }
        onError('');
        onChange(selected);
      }}
    />
  );
}

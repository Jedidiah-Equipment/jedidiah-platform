import { getDocumentPolicy, validateDocumentPolicy } from '@pkg/domain/equipment';
import type { DocumentOwnerType } from '@pkg/schema/equipment';
import { AttachmentField } from '@/components/attachments/AttachmentField.js';

export function DocumentFileField({
  error,
  file,
  id,
  label,
  metadata,
  onChange,
  onError,
  ownerType,
  pending,
}: {
  error: string;
  file: File | null;
  id?: string;
  label: string;
  metadata?: unknown;
  onChange: (file: File | null) => void;
  onError: (error: string) => void;
  ownerType: DocumentOwnerType;
  pending: boolean;
}) {
  const policy = getDocumentPolicy(ownerType, metadata);
  return (
    <AttachmentField
      accept={[
        ...policy.allowedContentTypes,
        ...(policy.allowedContentTypes.includes('application/zip') ? ['.zip'] : []),
      ].join(',')}
      error={error}
      file={file}
      id={id}
      label={label}
      pending={pending}
      policy={policy}
      onChange={(selected) => {
        if (selected) {
          const result = validateDocumentPolicy({
            byteSize: selected.size,
            contentType: selected.type || (selected.name.toLowerCase().endsWith('.zip') ? 'application/zip' : ''),
            metadata,
            ownerType,
          });
          if (!result.ok) {
            onError(result.message);
            return;
          }
        }
        onError('');
        onChange(selected);
      }}
    />
  );
}

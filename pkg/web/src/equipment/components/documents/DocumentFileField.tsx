import { getDocumentPolicy } from '@pkg/domain/equipment';
import type { DocumentOwnerType } from '@pkg/schema/equipment';
import { AttachmentField } from '@/components/attachments/AttachmentField.js';
import { getDocumentFileContentType, validateDocumentFile } from '@/equipment/utils/document.js';

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
      contentType={file ? getDocumentFileContentType(file) : undefined}
      error={error}
      file={file}
      id={id}
      label={label}
      pending={pending}
      policy={policy}
      onChange={(selected) => {
        if (selected) {
          const result = validateDocumentFile(selected, ownerType, metadata);
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

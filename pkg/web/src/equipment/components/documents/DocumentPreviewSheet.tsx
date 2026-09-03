import { formatBytes } from '@pkg/domain';
import { useCallback } from 'react';

import { FilePreviewSheet } from '@/equipment/components/documents/FilePreviewSheet.js';
import {
  type DocumentPreviewOwner,
  fetchDocumentPreviewBlob,
  getDocumentPreviewKind,
  type PreviewableDocument,
} from '@/equipment/utils/document.js';

type DocumentPreviewSheetProps = {
  document: PreviewableDocument | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  owner: DocumentPreviewOwner;
};

/** The caller keeps the document set while the sheet closes; nothing chosen means nothing to render. */
export function DocumentPreviewSheet({ document, ...props }: DocumentPreviewSheetProps) {
  return document ? <ChosenDocumentPreviewSheet document={document} {...props} /> : null;
}

/** A filed document is immutable, so its bytes stay cached for as long as the sheet holds them. */
function ChosenDocumentPreviewSheet({
  document,
  onOpenChange,
  open,
  owner,
}: Omit<DocumentPreviewSheetProps, 'document'> & { document: PreviewableDocument }) {
  const fetchBlob = useCallback(
    ({ signal }: { signal: AbortSignal }) => fetchDocumentPreviewBlob({ document, owner, signal }),
    [document, owner],
  );

  return (
    <FilePreviewSheet
      description={`${document.contentType} · ${formatBytes(document.byteSize)}`}
      downloadFilename={document.filename}
      fetchBlob={fetchBlob}
      kind={getDocumentPreviewKind(document)}
      onOpenChange={onOpenChange}
      open={open}
      queryKey={['document-preview', owner.type, owner.id, document.id]}
      staleTime={Infinity}
      subject="document"
      title={document.filename}
    />
  );
}

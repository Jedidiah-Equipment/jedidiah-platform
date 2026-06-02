import { formatBytes } from '@pkg/domain';
import type { DocumentMetadata } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import {
  type DocumentPreviewOwner,
  downloadDocument,
  fetchDocumentPreviewBlob,
  getDocumentPreviewKind,
} from '@/utils/document.js';

type DocumentPreviewSheetProps = {
  document: DocumentMetadata | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  owner: DocumentPreviewOwner;
};

export function DocumentPreviewSheet({ document, onOpenChange, open, owner }: DocumentPreviewSheetProps) {
  const showMutationError = useApiMutationErrorToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewKind = document ? getDocumentPreviewKind(document) : null;
  const previewQuery = useQuery({
    enabled: open && Boolean(document) && Boolean(previewKind),
    queryFn: ({ signal }) => {
      if (!document) {
        throw new Error('Choose a document to preview.');
      }

      return fetchDocumentPreviewBlob({ document, owner, signal });
    },
    queryKey: ['document-preview', owner.type, owner.id, document?.id],
    staleTime: Infinity,
  });
  const downloadMutation = useMutation({
    mutationFn: () => {
      if (!document) {
        throw new Error('Choose a document to download.');
      }

      return downloadDocument({ document, owner });
    },
    onError: (error) => {
      showMutationError(error, 'Unable to download document.');
    },
  });

  useEffect(() => {
    if (!open || !previewQuery.data) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(previewQuery.data);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [open, previewQuery.data]);

  const isLoadingPreview = open && Boolean(document) && Boolean(previewKind) && !previewUrl && previewQuery.isFetching;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="gap-0 p-0 data-[side=right]:w-[min(100vw,56rem)] data-[side=right]:sm:max-w-none"
        side="right"
      >
        <SheetHeader>
          <SheetTitle className="truncate">{document?.filename ?? 'Document preview'}</SheetTitle>
          <SheetDescription>
            {document ? `${document.contentType} · ${formatBytes(document.byteSize)}` : 'Preview document'}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex min-h-full flex-col gap-3 p-4">
            <DocumentPreviewContent
              document={document}
              isLoading={isLoadingPreview}
              previewKind={previewKind}
              previewUrl={previewUrl}
              queryError={previewQuery.error}
            />
            {document ? (
              <Button
                className="self-start"
                disabled={downloadMutation.isPending}
                type="button"
                variant="outline"
                onClick={() => void downloadMutation.mutateAsync()}
              >
                <DownloadIcon data-icon="inline-start" />
                Download
              </Button>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function DocumentPreviewContent({
  document,
  isLoading,
  previewKind,
  previewUrl,
  queryError,
}: {
  document: DocumentMetadata | null;
  isLoading: boolean;
  previewKind: ReturnType<typeof getDocumentPreviewKind>;
  previewUrl: string | null;
  queryError: unknown;
}) {
  if (!document) {
    return null;
  }

  if (!previewKind) {
    return (
      <Alert>
        <AlertTitle>Preview unavailable</AlertTitle>
        <AlertDescription>This document type cannot be previewed. Download the file to open it.</AlertDescription>
      </Alert>
    );
  }

  if (queryError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to preview document</AlertTitle>
        <AlertDescription>Download the file or try previewing it again.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !previewUrl) {
    return <Skeleton className="h-[calc(100vh-9rem)] w-full rounded-md" />;
  }

  if (previewKind === 'pdf') {
    return (
      <iframe
        className="h-[calc(100vh-9rem)] w-full rounded-md border bg-background"
        src={previewUrl}
        title={document.filename}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-9rem)] items-start justify-center">
      <img
        alt={document.filename}
        className="max-h-[calc(100vh-9rem)] max-w-full rounded-md border object-contain"
        src={previewUrl}
      />
    </div>
  );
}

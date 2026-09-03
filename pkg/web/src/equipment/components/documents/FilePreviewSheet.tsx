import { formatBytes } from '@pkg/domain';
import { IconDownload } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import type { DocumentPreviewKind } from '@/equipment/utils/document.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { saveBlobAsFile } from '@/utils/download.js';

type FilePreviewSheetProps = {
  /** Shown under the title until the bytes land and can describe themselves. */
  description?: string;
  downloadFilename: string;
  fetchBlob: (options: { signal: AbortSignal }) => Promise<Blob>;
  /** `null` for a file the browser cannot render inline — the sheet then offers the download alone. */
  kind: DocumentPreviewKind | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Distinguishes one previewed file from the next, and re-renders a generated one when it changes. */
  queryKey: readonly unknown[];
  staleTime?: number;
  /** Names the file in the failure copy: "Unable to preview this Purchase Order". */
  subject: string;
  title: string;
};

/**
 * One sheet for every file the app shows without leaving the page: stored documents and PDFs the API
 * renders per request alike. It holds the bytes itself rather than pointing an iframe at the route a
 * second time, which is what lets the same fetch serve both the preview and the Download button.
 */
export function FilePreviewSheet({
  description,
  downloadFilename,
  fetchBlob,
  kind,
  onOpenChange,
  open,
  queryKey,
  staleTime = 0,
  subject,
  title,
}: FilePreviewSheetProps) {
  const showMutationError = useApiMutationErrorToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewQuery = useQuery({
    enabled: open && kind !== null,
    queryFn: ({ signal }) => fetchBlob({ signal }),
    queryKey,
    staleTime,
  });
  const downloadMutation = useMutation({
    // The bytes on screen are the bytes that download; a file with no inline preview fetches on demand.
    mutationFn: async () => {
      const blob = previewQuery.data ?? (await fetchBlob({ signal: new AbortController().signal }));
      saveBlobAsFile({ blob, filename: downloadFilename });
    },
    onError: (error) => {
      showMutationError(error, `Unable to download this ${subject}.`);
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

  const isLoadingPreview = open && kind !== null && !previewUrl && previewQuery.isFetching;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="gap-0 p-0 data-[side=right]:w-[min(100vw,56rem)] data-[side=right]:sm:max-w-none"
        side="right"
      >
        <SheetHeader>
          <SheetTitle className="truncate">{title}</SheetTitle>
          <SheetDescription>
            {previewQuery.data
              ? `${previewQuery.data.type || 'application/octet-stream'} · ${formatBytes(previewQuery.data.size)}`
              : description}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex min-h-full flex-col gap-3 p-4">
            <FilePreviewContent
              isLoading={isLoadingPreview}
              kind={kind}
              previewUrl={previewUrl}
              queryError={previewQuery.error}
              subject={subject}
              title={title}
            />
            <Button
              className="self-start"
              disabled={downloadMutation.isPending || previewQuery.isFetching}
              onClick={() => void downloadMutation.mutateAsync()}
              type="button"
              variant="outline"
            >
              <IconDownload data-icon="inline-start" />
              Download
            </Button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function FilePreviewContent({
  isLoading,
  kind,
  previewUrl,
  queryError,
  subject,
  title,
}: {
  isLoading: boolean;
  kind: DocumentPreviewKind | null;
  previewUrl: string | null;
  queryError: unknown;
  subject: string;
  title: string;
}) {
  if (!kind) {
    return (
      <Alert>
        <AlertTitle>Preview unavailable</AlertTitle>
        <AlertDescription>This file type cannot be previewed. Download the file to open it.</AlertDescription>
      </Alert>
    );
  }

  if (queryError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to preview this {subject}</AlertTitle>
        <AlertDescription>Download the file or try previewing it again.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !previewUrl) {
    return <Skeleton className="h-[calc(100vh-9rem)] w-full rounded-md" />;
  }

  if (kind === 'pdf') {
    return (
      <iframe className="h-[calc(100vh-9rem)] w-full rounded-md border bg-background" src={previewUrl} title={title} />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-9rem)] items-start justify-center">
      <img
        alt={title}
        className="max-h-[calc(100vh-9rem)] max-w-full rounded-md border object-contain"
        src={previewUrl}
      />
    </div>
  );
}

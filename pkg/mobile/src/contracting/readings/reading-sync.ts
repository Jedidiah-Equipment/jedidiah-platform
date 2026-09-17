import type { AppRouter } from '@pkg/api';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { readingCapturePath } from '@/contracting/lib/contracting-http-paths';
import { apiBaseUrl } from '@/lib/api-base-url';
import { sessionCookieHeader } from '@/lib/auth';
import { withSessionCookie } from '@/lib/authed-fetch';
import { addBreadcrumb } from '@/lib/observability';
import { ReadingPhotoUnavailableError, readReadingPhotoPart } from './reading-files';
import { type QueuedReading, type ReadingQueue, ReadingSyncError } from './reading-queue';
import { uploadReading } from './reading-upload';

const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * One pass over the queue with the session cookie. `isActive` turning false (the provider unmounted or the
 * operator changed) stops the pass before the next upload.
 */
export async function syncReadingQueue({
  queue,
  queryClient,
  trpc,
  isActive,
  onFailure,
  onUploaded,
  send = fetch,
}: {
  queue: ReadingQueue;
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
  isActive: () => boolean;
  onFailure?: (failure: ReadingSyncFailure) => void;
  onUploaded?: (item: QueuedReading) => void;
  send?: (url: string, init: RequestInit) => Promise<Response>;
}): Promise<void> {
  const cookie = await sessionCookieHeader();
  if (!isActive()) return;
  let uploaded = false;
  let itemFailureReported = false;
  const { retryFailure } = await queue.sync(
    async (item) => {
      let stage: ReadingSyncFailure['stage'] = 'prepare_photo';
      try {
        const photo = item.photoLocalUri ? await readReadingPhotoPart(item.photoLocalUri) : undefined;
        if (!isActive()) throw new Error('Session changed');
        stage = 'upload';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
        const delivered = await uploadReading(
          item,
          (body) => observedReadingUpload(body, cookie, controller.signal, send),
          photo,
        ).finally(() => {
          clearTimeout(timeout);
        });
        uploaded = true;
        // Land the delivered reading in history before the queue drops the capture, so the
        // latest known reading never falls back to the previous one while a refetch is pending.
        queryClient.setQueryData(
          trpc.contractingReadings.fieldHistory.queryKey({ machineId: item.machineId }),
          (rows) => [delivered, ...(rows ?? []).filter((row) => row.id !== delivered.id)],
        );
        onUploaded?.(item);
      } catch (error) {
        const failure =
          error instanceof ReadingPhotoUnavailableError
            ? new ReadingSyncError('reading.photo_unavailable', error.message)
            : error;
        if (isActive() && onFailure) {
          onFailure({ error: failure, item, stage });
          itemFailureReported = true;
        }
        throw failure;
      }
    },
    () => isActive() && onlineManager.isOnline(),
  );
  if (uploaded && isActive())
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.contractingReadings.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.field.pathKey() }),
    ]);
  if (retryFailure && isActive()) throw new ReadingSyncPassError(itemFailureReported);
}

export class ReadingSyncPassError extends Error {
  constructor(readonly itemFailureReported: boolean) {
    super('Waiting to sync. Check your connection and sign-in.');
    this.name = 'ReadingSyncPassError';
  }
}

async function observedReadingUpload(
  body: FormData,
  cookie: string | null,
  signal: AbortSignal,
  send: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now();
  const route = readingCapturePath();
  try {
    const response = await send(`${apiBaseUrl}${route}`, withSessionCookie({ method: 'POST', body, signal }, cookie));
    addBreadcrumb('network', 'reading upload', {
      durationMs: Date.now() - startedAt,
      method: 'POST',
      route,
      status: response.status,
    });
    return response;
  } catch (error) {
    addBreadcrumb('network', 'reading upload failed', {
      durationMs: Date.now() - startedAt,
      method: 'POST',
      route,
      status: 0,
    });
    throw error;
  }
}

export type ReadingSyncFailure = {
  error: unknown;
  item: QueuedReading;
  stage: 'prepare_photo' | 'upload';
};

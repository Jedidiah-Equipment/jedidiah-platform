import type { AppRouter } from '@pkg/api';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { readingCapturePath } from '@/contracting/lib/contracting-http-paths';
import { apiBaseUrl } from '@/lib/api-base-url';
import { sessionCookieHeader } from '@/lib/auth';
import { withSessionCookie } from '@/lib/authed-fetch';
import { readReadingPhotoPart } from './reading-files';
import type { ReadingQueue } from './reading-queue';
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
  send = fetch,
}: {
  queue: ReadingQueue;
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
  isActive: () => boolean;
  send?: (url: string, init: RequestInit) => Promise<Response>;
}): Promise<void> {
  const cookie = await sessionCookieHeader();
  if (!isActive()) return;
  let uploaded = false;
  const { retryFailure } = await queue.sync(
    async (item) => {
      const photo = item.photoLocalUri ? await readReadingPhotoPart(item.photoLocalUri) : undefined;
      if (!isActive()) throw new Error('Session changed');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      const delivered = await uploadReading(
        item,
        (body) => {
          return send(
            `${apiBaseUrl}${readingCapturePath()}`,
            withSessionCookie({ method: 'POST', body, signal: controller.signal }, cookie),
          );
        },
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
    },
    () => isActive() && onlineManager.isOnline(),
  );
  if (uploaded && isActive()) void queryClient.invalidateQueries({ queryKey: trpc.contractingReadings.pathKey() });
  if (retryFailure && isActive()) throw new Error('Waiting to sync. Check your connection and sign-in.');
}

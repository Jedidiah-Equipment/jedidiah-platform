import type { AppRouter } from '@pkg/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { beforeEach, expect, test, vi } from 'vitest';

const readingFiles = vi.hoisted(() => ({
  readReadingPhotoPart: vi.fn(async () => new Blob(['meter'], { type: 'image/jpeg' })),
}));

vi.mock('@/lib/api-base-url', () => ({ apiBaseUrl: 'https://api.jedidiah.test' }));
vi.mock('@/lib/auth', () => ({ sessionCookieHeader: async () => 'better-auth.session_token=secret' }));
vi.mock('./reading-files', () => ({
  ...readingFiles,
  ReadingPhotoUnavailableError: class ReadingPhotoUnavailableError extends Error {},
}));

import { createReadingQueue, newLocalId } from './reading-queue';
import { syncReadingQueue } from './reading-sync';

const machineId = newLocalId();
const capture = (value: number, capturedAt: string, machine = machineId) => ({
  localId: newLocalId(),
  machineId: machine,
  role: 'spot' as const,
  value,
  capturedAt,
  photoLocalUri: 'file:///readings/meter.jpg',
  disputePrevious: false,
  comment: null,
});
const setup = () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: createTRPCClient<AppRouter>({ links: [] }), queryClient });
  const queue = createReadingQueue({ storage: AsyncStorage, key: 'operator-1', removePhoto: async () => {} });
  return { queryClient, trpc, queue };
};
beforeEach(() => {
  readingFiles.readReadingPhotoPart.mockReset();
  readingFiles.readReadingPhotoPart.mockResolvedValue(new Blob(['meter'], { type: 'image/jpeg' }));
  return AsyncStorage.clear();
});

test('delivers each capture with the session cookie and lands it in history before the queue drops it', async () => {
  const { queryClient, trpc, queue } = setup();
  const first = capture(100, '2026-09-08T08:00:00Z');
  await queue.enqueue(first);
  const historyKey = trpc.contractingReadings.fieldHistory.queryKey({ machineId });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const send = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe('https://api.jedidiah.test/api/contracting/readings');
    expect(new Headers(init.headers).get('Cookie')).toBe('better-auth.session_token=secret');
    expect((init.body as FormData).get('localId')).toBe(first.localId);
    expect(await queue.list()).toHaveLength(1);
    return Response.json(
      {
        id: newLocalId(),
        machineId,
        role: 'spot',
        value: 100,
        capturedAt: first.capturedAt,
        disputed: false,
        photo: null,
      },
      { status: 201 },
    );
  });
  await syncReadingQueue({ queue, queryClient, trpc, isActive: () => true, send });
  expect(send).toHaveBeenCalledOnce();
  expect(await queue.list()).toEqual([]);
  expect(queryClient.getQueryData(historyKey)).toMatchObject([{ value: 100, photoBacked: false }]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: trpc.contractingReadings.pathKey() });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: trpc.contractingJobs.field.pathKey() });
});

test('stops before the next upload once the provider is no longer active', async () => {
  const { queryClient, trpc, queue } = setup();
  await queue.enqueue(capture(100, '2026-09-08T08:00:00Z'));
  await queue.enqueue(capture(110, '2026-09-08T09:00:00Z', newLocalId()));
  let active = true;
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const send = vi.fn(async () => {
    active = false;
    return new Response(null, { status: 500 });
  });
  await syncReadingQueue({ queue, queryClient, trpc, isActive: () => active, send });
  expect(send).toHaveBeenCalledOnce();
  expect(await queue.list()).toHaveLength(2);
  expect(invalidate).not.toHaveBeenCalled();
});

test('reports a retryable transport failure with operator-friendly text while keeping the capture queued', async () => {
  const { queryClient, trpc, queue } = setup();
  await queue.enqueue(capture(100, '2026-09-08T08:00:00Z'));

  await expect(
    syncReadingQueue({
      queue,
      queryClient,
      trpc,
      isActive: () => true,
      send: async () => {
        throw new Error('fetch failed: The operation was aborted.');
      },
    }),
  ).rejects.toThrow('Waiting to sync. Check your connection and sign-in.');
  await expect(queue.list()).resolves.toHaveLength(1);
});

test('moves an unreadable retained photo to Needs attention before attempting HTTP', async () => {
  const { queryClient, trpc, queue } = setup();
  await queue.enqueue(capture(100, '2026-09-08T08:00:00Z'));
  const { ReadingPhotoUnavailableError } = await import('./reading-files');
  readingFiles.readReadingPhotoPart.mockRejectedValueOnce(new ReadingPhotoUnavailableError());
  const send = vi.fn();
  const onFailure = vi.fn();

  await syncReadingQueue({ queue, queryClient, trpc, isActive: () => true, onFailure, send });

  expect(send).not.toHaveBeenCalled();
  await expect(queue.list()).resolves.toMatchObject([{ attention: { code: 'reading.photo_unavailable' } }]);
  expect(onFailure).toHaveBeenCalledWith(
    expect.objectContaining({
      stage: 'prepare_photo',
      error: expect.objectContaining({ code: 'reading.photo_unavailable' }),
    }),
  );
});

test('reports the same retryable failure to sync calls that join an upload in progress', async () => {
  const { queryClient, trpc, queue } = setup();
  await queue.enqueue(capture(100, '2026-09-08T08:00:00Z'));
  let respond = (_response: Response) => {};
  const response = new Promise<Response>((resolve) => {
    respond = resolve;
  });
  const send = vi.fn(async () => response);
  const options = { queue, queryClient, trpc, isActive: () => true, send };

  const first = syncReadingQueue(options);
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  const second = syncReadingQueue(options);
  respond(new Response(null, { status: 401 }));

  const results = await Promise.allSettled([first, second]);
  expect(results).toHaveLength(2);
  for (const result of results) {
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { message: 'Waiting to sync. Check your connection and sign-in.' },
    });
  }
  await expect(queue.list()).resolves.toHaveLength(1);
});

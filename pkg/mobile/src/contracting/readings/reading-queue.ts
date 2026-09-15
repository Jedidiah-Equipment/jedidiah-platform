import { UUID } from '@pkg/schema';
import { ReadingCaptureInput } from '@pkg/schema/contracting';
import { z } from 'zod';

export const QueuedReading = ReadingCaptureInput.extend({
  localId: UUID,
  role: z.literal('spot'),
  photoLocalUri: z.string().nullable(),
  attention: z.object({ code: z.string(), message: z.string() }).optional(),
}).strip();
export type QueuedReading = z.infer<typeof QueuedReading>;

// A v4 UUID without a native dependency; it is an idempotency identifier, not a secret.
export function newLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 3) | 8).toString(16);
  });
}
export class ReadingSyncError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
type QueuePorts = {
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
  key: string;
  removePhoto(uri: string): Promise<void>;
};

/** All storage mutations are serialized; network I/O never holds the storage lock. */
export function createReadingQueue({ storage, key, removePhoto }: QueuePorts) {
  let writes: Promise<unknown> = Promise.resolve();
  let syncing: Promise<{ retryFailure: Error | null }> | null = null;
  const listeners = new Set<() => void>();
  async function read(): Promise<QueuedReading[]> {
    const raw = await storage.getItem(key);
    const rows = raw ? parseJson(raw) : [];
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
      const parsed = QueuedReading.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  }
  function mutate(change: (rows: QueuedReading[]) => QueuedReading[]) {
    const result = writes.then(async () => {
      await storage.setItem(key, JSON.stringify(change(await read())));
      for (const listener of listeners) listener();
    });
    writes = result.catch(() => {});
    return result;
  }
  async function list() {
    await writes;
    return read();
  }
  async function remove(localId: string) {
    const item = (await list()).find((row) => row.localId === localId);
    await mutate((rows) => rows.filter((row) => row.localId !== localId));
    // A cleanup failure must never resurrect a successfully delivered reading.
    if (item?.photoLocalUri) await removePhoto(item.photoLocalUri).catch(() => {});
  }
  return {
    list,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enqueue(item: QueuedReading) {
      return mutate((rows) => {
        if (rows.some((row) => row.localId === item.localId)) throw new Error('Capture already queued');
        return [...rows, item];
      });
    },
    discard: remove,
    resubmit(localId: string, expectedPreviousId: string | null) {
      return mutate((rows) =>
        rows.map((row) =>
          row.localId === localId ? { ...row, disputePrevious: true, expectedPreviousId, attention: undefined } : row,
        ),
      );
    },
    sync(upload: (item: QueuedReading) => Promise<void>, canSync = () => true) {
      if (syncing) return syncing;
      syncing = (async () => {
        const blocked = new Set<string>();
        let retryFailure: Error | null = null;
        const rows = (await list()).sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
        for (const item of rows) {
          if (!canSync()) break;
          if (item.attention) blocked.add(item.machineId);
          if (blocked.has(item.machineId)) continue;
          try {
            await upload(item);
          } catch (error) {
            blocked.add(item.machineId);
            if (error instanceof ReadingSyncError) {
              await mutate((current) =>
                current.map((row) =>
                  row.localId === item.localId
                    ? { ...row, attention: { code: error.code, message: error.message } }
                    : row,
                ),
              );
            } else if (!retryFailure) {
              retryFailure = error instanceof Error ? error : new Error('Reading sync failed');
            }
            continue;
          }
          await remove(item.localId);
        }
        return { retryFailure };
      })().finally(() => {
        syncing = null;
      });
      return syncing;
    },
  };
}
export type ReadingQueue = ReturnType<typeof createReadingQueue>;

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

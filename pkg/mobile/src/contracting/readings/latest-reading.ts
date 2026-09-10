import type { QueuedReading } from './reading-queue';

type SyncedReading = { id: string; value: number; capturedAt: string };

/** The machine's latest known reading: the newest of the local queue and synced history. */
export function latestKnownReading(
  machineId: string,
  queued: QueuedReading[],
  synced: SyncedReading[] | undefined,
): { value: number; id: string } | undefined {
  const local = queued
    .filter((row) => row.machineId === machineId)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0];
  const server = synced?.[0];
  if (local && (!server || Date.parse(local.capturedAt) >= Date.parse(server.capturedAt)))
    return { value: local.value, id: local.localId };
  return server ? { value: server.value, id: server.id } : undefined;
}

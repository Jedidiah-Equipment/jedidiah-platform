import { addBreadcrumb, captureEvent, captureException } from '@/lib/observability';
import type { ObservabilityProperties } from '@/lib/observability-contract';
import { type QueuedReading, ReadingSyncError } from './readings/reading-queue';
import type { ReadingSyncFailure } from './readings/reading-sync';

export function readingProperties(item: QueuedReading, now = Date.now()): ObservabilityProperties {
  return {
    hasPhoto: item.photoLocalUri !== null,
    queueAgeSeconds: Math.max(0, Math.floor((now - Date.parse(item.capturedAt)) / 1000)),
    role: item.role,
  };
}

export function recordReadingCaptured(item: QueuedReading, offline: boolean): void {
  const properties = { hasPhoto: item.photoLocalUri !== null, offline, role: item.role };
  addBreadcrumb('contracting', 'reading enqueued', properties);
  captureEvent('reading captured', properties);
  if (item.startAssignment) {
    captureEvent('machine added to job', { jobId: item.startAssignment.jobId, machineId: item.machineId });
  }
}

export function recordReadingSynced(item: QueuedReading): void {
  const properties = readingProperties(item);
  addBreadcrumb('contracting', 'item uploaded', properties);
  captureEvent('reading synced', properties);
}

export function recordReadingSyncFailure(
  failure: ReadingSyncFailure,
  properties: ObservabilityProperties | null,
): void {
  if (!properties) return;
  addBreadcrumb('contracting', 'item failed', properties);
  if (failure.error instanceof ReadingSyncError) {
    addBreadcrumb('contracting', 'item marked attention', properties);
  }
  captureEvent('reading sync failed', properties);
  captureException(failure.error, { ...properties, source: 'reading_queue' });
}

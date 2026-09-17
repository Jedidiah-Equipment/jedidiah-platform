import AsyncStorage from '@react-native-async-storage/async-storage';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import { recordReadingSynced, recordReadingSyncFailure } from '@/contracting/observability';
import { apiBaseUrl } from '@/lib/api-base-url';
import { useAuthSession } from '@/lib/auth-session';
import { addBreadcrumb, captureException } from '@/lib/observability';
import { useTRPC } from '@/lib/trpc';
import { removeReadingPhoto } from './reading-files';
import { createReadingQueue, type QueuedReading, type ReadingQueue } from './reading-queue';
import { syncReadingQueue } from './reading-sync';
import { readingSyncTelemetryPayload, reportReadingSyncFailure } from './reading-telemetry';

// Outlives the provider, which remounts when the signed-in operator changes, so a sync still in flight
// and its serialized storage writes are never started twice for the same operator.
const queues = new Map<string, ReadingQueue>();
const Context = createContext<{
  queue: ReadingQueue;
  items: QueuedReading[];
  error: string | null;
  sync: () => void;
} | null>(null);

export function ReadingQueueProvider({ children }: { children: ReactNode }) {
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const key = contractingStorageKey('readings', 'v1', apiBaseUrl, session.user.id);
  const queue = useMemo(() => {
    let queue = queues.get(key);
    if (!queue) {
      queue = createReadingQueue({
        storage: AsyncStorage,
        key,
        removePhoto: removeReadingPhoto,
        onError: (error, operation) => captureException(error, { source: 'reading_queue', stage: operation }),
      });
      queues.set(key, queue);
    }
    return queue;
  }, [key]);
  const [items, setItems] = useState<QueuedReading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const liveQueue = useRef<ReadingQueue | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void queue
        .list()
        .then((rows) => {
          if (active) setItems(rows);
        })
        .catch((error: Error) => {
          captureException(error, { source: 'reading_queue', stage: 'list' });
          if (active) setError(error.message);
        });
    };
    refresh();
    const unsubscribe = queue.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [queue]);
  const sync = useCallback(async () => {
    const isActive = () => liveQueue.current === queue;
    if (!isActive() || !onlineManager.isOnline() || AppState.currentState === 'background') return;
    addBreadcrumb('contracting', 'sync pass started');
    try {
      await syncReadingQueue({
        queue,
        queryClient,
        trpc,
        isActive,
        onFailure: (failure) => {
          recordReadingSyncFailure(failure, readingSyncTelemetryPayload(failure)?.properties ?? null);
          void reportReadingSyncFailure(failure);
        },
        onUploaded: recordReadingSynced,
      });
      addBreadcrumb('contracting', 'sync pass finished');
      if (isActive()) setError(null);
    } catch (error) {
      captureException(error, { source: 'reading_queue', stage: 'sync_pass' });
      addBreadcrumb('contracting', 'sync pass finished', { outcome: 'failed' });
      if (isActive()) setError(error instanceof Error ? error.message : 'Unable to read the saved queue.');
    }
  }, [queue, queryClient, trpc]);
  useEffect(() => {
    liveQueue.current = queue;
    const trigger = () => {
      void sync();
    };
    trigger();
    const online = onlineManager.subscribe(trigger);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') trigger();
    });
    const timer = setInterval(trigger, 15_000);
    const changed = queue.subscribe(trigger);
    return () => {
      liveQueue.current = null;
      online();
      app.remove();
      clearInterval(timer);
      changed();
    };
  }, [queue, sync]);
  const value = useMemo(
    () => ({
      queue,
      items,
      error,
      sync: () => {
        void sync();
      },
    }),
    [queue, items, error, sync],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useReadingQueue() {
  const context = useContext(Context);
  if (!context) throw new Error('ReadingQueueProvider is required');
  return context;
}

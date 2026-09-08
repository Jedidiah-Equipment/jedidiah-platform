import AsyncStorage from '@react-native-async-storage/async-storage';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { apiBaseUrl } from '@/lib/api-base-url';
import { sessionCookieHeader } from '@/lib/auth';
import { useAuthSession } from '@/lib/auth-session';
import { withSessionCookie } from '@/lib/authed-fetch';
import { removeReadingPhoto } from './reading-files';
import { createReadingQueue, type QueuedReading, type ReadingQueue } from './reading-queue';
import { uploadReading } from './reading-upload';

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
  const key = `contracting:readings:v1:${apiBaseUrl}:${session.user.id}`;
  const queue = useMemo(() => {
    let queue = queues.get(key);
    if (!queue) {
      queue = createReadingQueue({ storage: AsyncStorage, key, removePhoto: removeReadingPhoto });
      queues.set(key, queue);
    }
    return queue;
  }, [key]);
  const [items, setItems] = useState<QueuedReading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const syncRef = useRef(() => {});
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void queue
        .list()
        .then((rows) => {
          if (active) setItems(rows);
        })
        .catch((error: Error) => {
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
  useEffect(() => {
    let active = true;
    let running = false;
    async function sync() {
      if (!active || running || !onlineManager.isOnline() || AppState.currentState === 'background') return;
      running = true;
      try {
        const cookie = await sessionCookieHeader();
        if (!active) return;
        let uploaded = false;
        await queue.sync(
          async (item) => {
            const photo =
              Platform.OS === 'web' && item.photoLocalUri ? await (await fetch(item.photoLocalUri)).blob() : undefined;
            if (!active) throw new Error('Session changed');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60_000);
            try {
              await uploadReading(
                item,
                (body) =>
                  fetch(
                    `${apiBaseUrl}/api/contracting/readings`,
                    withSessionCookie({ method: 'POST', body, signal: controller.signal }, cookie),
                  ),
                photo,
              );
              uploaded = true;
            } finally {
              clearTimeout(timeout);
            }
          },
          () => active && onlineManager.isOnline(),
        );
        if (active) {
          setError(null);
          if (uploaded) void queryClient.invalidateQueries({ queryKey: [['contractingReadings']] });
        }
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : 'Unable to read the saved queue.');
      } finally {
        running = false;
      }
    }
    syncRef.current = () => {
      void sync();
    };
    void sync();
    const online = onlineManager.subscribe(() => {
      void sync();
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    const timer = setInterval(() => {
      void sync();
    }, 15_000);
    const changed = queue.subscribe(() => {
      void sync();
    });
    return () => {
      active = false;
      online();
      app.remove();
      clearInterval(timer);
      changed();
    };
  }, [queue, queryClient]);
  return <Context.Provider value={{ queue, items, error, sync: () => syncRef.current() }}>{children}</Context.Provider>;
}
export function useReadingQueue() {
  const context = useContext(Context);
  if (!context) throw new Error('ReadingQueueProvider is required');
  return context;
}

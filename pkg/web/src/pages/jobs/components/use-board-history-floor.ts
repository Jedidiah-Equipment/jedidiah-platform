import type { DateOnlyIso } from '@pkg/schema';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BOARD_HISTORY_EXTENSION_DEBOUNCE_MS,
  getInitialBoardHistoryFloor,
  getNextBoardHistoryFloor,
} from './board-history-floor.js';
import { toJobCalendarDateKey } from './job-date-key.js';

/**
 * Owns the Gantt's backward-only history floor. The visible-window handler debounces a one-bucket
 * extension whenever the viewport scrolls past the loaded floor, and re-arms after each extension lands
 * so a single far-back scroll keeps pulling month buckets until the viewport is covered. The floor only
 * ever lowers within a session; scrolling forward inside the loaded range is a no-op.
 */
export function useBoardHistoryFloor(): {
  historyFloor: DateOnlyIso;
  onVisibleWindowChange: (window: { start: Date }) => void;
} {
  // The first Gantt read needs its own back-context before the server returns plant `today`.
  const [historyFloor, setHistoryFloor] = useState(() => getInitialBoardHistoryFloor(toJobCalendarDateKey(new Date())));
  const extensionTimeoutRef = useRef<number | null>(null);
  const latestViewportStartRef = useRef<DateOnlyIso | null>(null);

  const clearExtensionTimeout = useCallback(() => {
    if (extensionTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(extensionTimeoutRef.current);
    extensionTimeoutRef.current = null;
  }, []);

  const scheduleExtension = useCallback(
    (viewportStart: DateOnlyIso) => {
      latestViewportStartRef.current = viewportStart;
      clearExtensionTimeout();
      extensionTimeoutRef.current = window.setTimeout(() => {
        extensionTimeoutRef.current = null;
        setHistoryFloor((currentFloor) =>
          getNextBoardHistoryFloor(currentFloor, latestViewportStartRef.current ?? viewportStart),
        );
      }, BOARD_HISTORY_EXTENSION_DEBOUNCE_MS);
    },
    [clearExtensionTimeout],
  );

  const onVisibleWindowChange = useCallback(
    ({ start }: { start: Date }) => {
      const viewportStart = toJobCalendarDateKey(start);
      latestViewportStartRef.current = viewportStart;

      if (getNextBoardHistoryFloor(historyFloor, viewportStart) === historyFloor) {
        clearExtensionTimeout();
        return;
      }

      scheduleExtension(viewportStart);
    },
    [clearExtensionTimeout, historyFloor, scheduleExtension],
  );

  // Once an extension lowers the floor, re-check against the latest viewport and chain another bucket
  // if it still reaches further back — the "load history in debounced chunks" behavior.
  useEffect(() => {
    const viewportStart = latestViewportStartRef.current;

    if (!viewportStart) {
      return;
    }

    if (getNextBoardHistoryFloor(historyFloor, viewportStart) === historyFloor) {
      clearExtensionTimeout();
      return;
    }

    scheduleExtension(viewportStart);
  }, [clearExtensionTimeout, historyFloor, scheduleExtension]);

  useEffect(() => clearExtensionTimeout, [clearExtensionTimeout]);

  return { historyFloor, onVisibleWindowChange };
}

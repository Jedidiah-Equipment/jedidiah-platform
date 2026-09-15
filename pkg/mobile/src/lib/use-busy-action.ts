import { useCallback, useRef, useState } from 'react';

/** Runs one async action at a time, exposing its progress and the message of its last failure. */
export function useBusyAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State updates land a render late; the ref drops a second tap made before `busy` disables the control.
  const running = useRef(false);
  const run = useCallback(async (action: () => Promise<void>, fallbackMessage: string) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

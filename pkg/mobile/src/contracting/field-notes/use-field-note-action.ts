import { useCallback } from 'react';
import { captureSanitizedException } from '@/lib/observability';
import { PhotoAccessError } from '@/lib/photo-picker';
import { useBusyAction } from '@/lib/use-busy-action';
import { FieldNoteError } from './store';

/**
 * One Field Note action at a time. A refusal, the store's or the photo picker's, shows its own sentence; anything
 * else is a device failure, reported without its message (it can carry a file path) and shown as `failure`.
 */
export function useFieldNoteAction() {
  const { busy, error, setError, run } = useBusyAction();
  const report = useCallback(
    (error: unknown, failure: string) => {
      const refused = error instanceof FieldNoteError || error instanceof PhotoAccessError;
      if (!refused) captureSanitizedException(error, 'Field Note action failed', { source: 'field_notes' });
      setError(refused ? error.message : failure);
    },
    [setError],
  );
  const act = useCallback(
    (action: () => Promise<void>, failure: string) =>
      run(() => action().catch((error) => report(error, failure)), failure),
    [run, report],
  );
  return { busy, error, act, report };
}

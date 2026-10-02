import { useCallback } from 'react';
import { captureSanitizedException } from '@/lib/observability';
import { useBusyAction } from '@/lib/use-busy-action';
import { FieldNoteError } from './store';

/**
 * One Field Note action at a time. A refusal shows its own sentence; anything else is a device failure,
 * reported without its message (it can carry a file path) and shown as `failure`.
 */
export function useFieldNoteAction() {
  const { busy, error, setError, run } = useBusyAction();
  const act = useCallback(
    (action: () => Promise<void>, failure: string) =>
      run(async () => {
        try {
          await action();
        } catch (error) {
          if (!(error instanceof FieldNoteError))
            captureSanitizedException(error, 'Field Note action failed', { source: 'field_notes' });
          setError(error instanceof FieldNoteError ? error.message : failure);
        }
      }, failure),
    [run, setError],
  );
  return { busy, error, setError, act };
}

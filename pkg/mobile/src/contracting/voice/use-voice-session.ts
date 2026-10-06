import type { Transcription } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTRPC } from '@/lib/trpc';

export type VoiceSession = {
  purpose: string;
  remember: (transcription: Transcription) => void;
  /** Call after the owning form's save succeeded, with the field's final text. Fire-and-forget. */
  reportSaved: (text: string) => void;
  reset: () => void;
  /** True while the field is recording or transcribing: the owning form holds its save until the text has landed. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
};

/** One field's voice history: the Transcriptions that fed it, reported once the form that owns the field has saved. */
export function useVoiceSession(purpose: string): VoiceSession {
  const trpc = useTRPC();
  const { mutate } = useMutation(trpc.contractingTranscriptions.saved.mutationOptions());
  // A ref, not state: a save reports what was remembered even when it lands in the same render as the transcript.
  const transcriptions = useRef<Transcription[]>([]);
  const [busy, setBusy] = useState(false);
  const remember = useCallback((transcription: Transcription) => {
    transcriptions.current = [...transcriptions.current, transcription];
  }, []);
  const reportSaved = useCallback(
    (text: string) => {
      const pending = transcriptions.current;
      transcriptions.current = [];
      for (const transcription of pending)
        mutate({ id: transcription.id, text, purpose }, { onError: () => undefined });
    },
    [mutate, purpose],
  );
  const reset = useCallback(() => {
    transcriptions.current = [];
  }, []);
  return useMemo(
    () => ({ purpose, remember, reportSaved, reset, busy, setBusy }),
    [purpose, remember, reportSaved, reset, busy],
  );
}

import { formatClock } from '@pkg/domain';
import { VOICE_NOTE_MAX_SECONDS } from '@pkg/domain/contracting';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  recordVoiceNoteFailed,
  recordVoiceNoteTranscribed,
  recordVoiceRecorderFailed,
} from '@/contracting/observability';
import { UploadRefusedError } from '@/lib/multipart-upload';
import { useTRPC } from '@/lib/trpc';
import { transcribeRecording } from './transcribe-upload';
import { useVoiceRecorder } from './use-voice-recorder';
import { type FieldSpans, insertTranscript, keptTexts, trackEdit } from './voice-spans';

const UNAVAILABLE = 'Transcription unavailable — type the note.';
const MAX_CLOCK = formatClock(VOICE_NOTE_MAX_SECONDS);

/** The text field a voice session feeds: a transcript lands appended to `value` through `onChangeText`. */
export type VoiceField = {
  value: string;
  onChangeText: (text: string) => void;
  maxLength?: number;
};

export type VoiceSession = VoiceField & {
  purpose: string;
  /** Call after the owning form's save succeeded: each Transcription reports what was kept in its place. Fire-and-forget. */
  reportSaved: () => void;
  /** Forgets the Transcriptions that fed the field, when the form drops its draft. */
  reset: () => void;
  /** True while the field is recording or transcribing: the owning form holds its save until the text has landed. */
  busy: boolean;
  transcribing: boolean;
  /** The mic is open: a finger holds it and the Voice Note limit has not cut the note off. */
  listening: boolean;
  /** The line under the field: what the mic is doing, or the last thing it could not do. */
  status: string;
  onPressIn: () => void;
  onPressOut: () => void;
  /** Stops and drops a recording whose mic is gone (the signal dropped, the form locked, the field unmounted). */
  cancel: () => void;
};

/**
 * One field's voice: the press-and-hold recorder, the transcript appended to the field, and the Transcriptions that
 * fed it, each reported once the form that owns the field has saved with the text that stands where its transcript
 * was inserted.
 */
export function useVoiceSession(purpose: string, field: VoiceField): VoiceSession {
  const trpc = useTRPC();
  const { mutate } = useMutation(trpc.contractingTranscriptions.saved.mutationOptions());
  const recorder = useVoiceRecorder();
  const [holding, setHolding] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Refs, not state: a save reports what was remembered even when it lands in the same render as the transcript, and
  // the transcript appends to the text as it is once the request answers, not as it was when the finger lifted.
  const latest = useRef(field);
  latest.current = field;
  const track = useRef<FieldSpans>({ text: field.value, spans: [] });
  const lastSeenValue = useRef(field.value);
  const held = useRef(false);
  const { value, maxLength } = field;
  const { start, stop } = recorder;

  // The owning form may also set the text itself (a revert, a reload); those edits move the spans too. Only a value
  // the field has newly taken counts: until the form re-renders, it still holds the text from before our own edit.
  const followField = useCallback(() => {
    const { value } = latest.current;
    if (value === lastSeenValue.current) return;
    lastSeenValue.current = value;
    track.current = trackEdit(track.current, value);
  }, []);
  useEffect(() => {
    if (value !== lastSeenValue.current) followField();
  }, [value, followField]);
  const applyEdit = useCallback(
    (edit: (current: FieldSpans) => FieldSpans) => {
      followField();
      track.current = edit(track.current);
      return track.current;
    },
    [followField],
  );
  const onChangeText = useCallback(
    (text: string) => latest.current.onChangeText(applyEdit((current) => trackEdit(current, text)).text),
    [applyEdit],
  );

  const hold = useCallback((holding: boolean) => {
    held.current = holding;
    setHolding(holding);
  }, []);

  const reset = useCallback(() => {
    applyEdit((current) => ({ text: current.text, spans: [] }));
  }, [applyEdit]);
  const reportSaved = useCallback(() => {
    const kept = keptTexts(applyEdit((current) => current));
    reset();
    for (const { id, text } of kept) mutate({ id, text, purpose }, { onError: () => undefined });
  }, [mutate, purpose, applyEdit, reset]);

  const onPressIn = useCallback(() => {
    void (async () => {
      if (transcribing) return;
      setMessage(null);
      hold(true);
      const started = await start().catch((error: unknown) => {
        recordVoiceRecorderFailed(error, 'start');
        return 'failed' as const;
      });
      if (started !== 'recording') hold(false);
      if (started === 'allowed') setMessage('Microphone allowed. Hold the mic while you speak.');
      if (started === 'denied') setMessage('Allow the microphone in Settings to record voice notes.');
      if (started === 'unsupported') setMessage('Voice notes are not supported in the browser — use the app.');
      if (started === 'failed') setMessage(UNAVAILABLE);
    })();
  }, [transcribing, hold, start]);

  const onPressOut = useCallback(() => {
    void (async () => {
      if (transcribing) return;
      const recording = await stop().catch((error: unknown) => {
        recordVoiceRecorderFailed(error, 'stop');
        return null;
      });
      setTranscribing(recording !== null);
      hold(false);
      if (!recording) return;
      const { uri, ...measured } = recording;
      const sentAt = Date.now();
      const attempt = () => ({ purpose, ...measured, requestMs: Date.now() - sentAt });
      try {
        const transcription = await transcribeRecording(uri, purpose);
        const { text } = applyEdit((current) =>
          insertTranscript(current, transcription.id, transcription.text, latest.current.maxLength),
        );
        latest.current.onChangeText(text);
        recordVoiceNoteTranscribed(attempt(), transcription.language);
      } catch (error) {
        setMessage(error instanceof UploadRefusedError ? error.message : UNAVAILABLE);
        recordVoiceNoteFailed(attempt(), error);
      } finally {
        setTranscribing(false);
      }
    })();
  }, [transcribing, hold, stop, purpose, applyEdit]);

  const cancel = useCallback(() => {
    if (!held.current) return;
    hold(false);
    void stop().catch((error: unknown) => recordVoiceRecorderFailed(error, 'stop'));
  }, [hold, stop]);

  const busy = holding || transcribing;
  // The recorder's own flag is polled and lags; a held finger is the live signal until the limit cuts the note off.
  const listening = holding && !recorder.capped;
  const status = transcribing
    ? 'Transcribing…'
    : recorder.recording
      ? `Recording ${formatClock(recorder.seconds)} / ${MAX_CLOCK} · release to stop`
      : (message ?? 'Hold to record a voice note');

  return useMemo(
    () => ({
      purpose,
      value,
      onChangeText,
      maxLength,
      reportSaved,
      reset,
      busy,
      transcribing,
      listening,
      status,
      onPressIn,
      onPressOut,
      cancel,
    }),
    [
      purpose,
      value,
      onChangeText,
      maxLength,
      reportSaved,
      reset,
      busy,
      transcribing,
      listening,
      status,
      onPressIn,
      onPressOut,
      cancel,
    ],
  );
}

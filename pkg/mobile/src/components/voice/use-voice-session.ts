import { formatClock, VOICE_NOTE_MAX_SECONDS } from '@pkg/domain';
import type { Business } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { UploadRefusedError } from '@/lib/multipart-upload';
import { useTRPC } from '@/lib/trpc';
import { transcribeRecording } from './transcribe-upload';
import { useVoiceRecorder } from './use-voice-recorder';
import { recordVoiceNoteFailed, recordVoiceNoteTranscribed, recordVoiceRecorderFailed } from './voice-observability';
import { type FieldSpans, insertTranscript, keptTexts, trackEdit } from './voice-spans';

const UNAVAILABLE = 'Transcription unavailable — type the note.';
const MAX_CLOCK = formatClock(VOICE_NOTE_MAX_SECONDS);

/** The text field a voice session feeds, which owns its text: a transcript lands appended through `onChangeText`. */
export type VoiceField = {
  value: string;
  onChangeText: (text: string) => void;
  maxLength?: number | undefined;
};

/** Which business the field belongs to, and the screen's label for what its text is for ("job feedback"). */
export type VoiceSessionScope = { business: Business; purpose: string };

export type VoiceSession = {
  business: Business;
  purpose: string;
  /**
   * Called by the field after every commit with its current text, so the session follows it without owning it.
   * Returns the detach the field runs when it goes: a transcript that lands after its field is gone is dropped.
   */
  attach: (field: VoiceField) => () => void;
  /** The field's edit handler: the edit is tracked, then written through the attached field. */
  onChangeText: (text: string) => void;
  /** Call after the owning form's save succeeded: each Transcription reports what was kept in its place. Fire-and-forget. */
  reportSaved: () => void;
  /**
   * For a field that stays editable while its form saves: call as the save begins, and call what it returns once the
   * save succeeded, so each Transcription reports the text that was saved rather than what was typed since.
   */
  snapshotSaved: () => () => void;
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
export function useVoiceSession({ business, purpose }: VoiceSessionScope): VoiceSession {
  const trpc = useTRPC();
  const { mutate } = useMutation(trpc.transcriptions.saved.mutationOptions());
  const recorder = useVoiceRecorder();
  const [holding, setHolding] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Refs, not state: a save reports what was remembered even before the field re-renders with a transcript, and the
  // transcript appends to the text as it is once the request answers, not as it was when the finger lifted.
  const latest = useRef<VoiceField | null>(null);
  const track = useRef<FieldSpans | null>(null);
  const lastSeenValue = useRef('');
  const held = useRef(false);
  const { start, stop } = recorder;

  const attachment = useRef<object | null>(null);
  const attach = useCallback((field: VoiceField) => {
    const token = {};
    attachment.current = token;
    latest.current = field;
    if (track.current === null) {
      track.current = { text: field.value, spans: [] };
      lastSeenValue.current = field.value;
    }
    return () => {
      if (attachment.current !== token) return;
      attachment.current = null;
      latest.current = null;
    };
  }, []);
  // The owning form may also set the text itself (a revert, a reload); those edits move the spans too, so every edit
  // the session makes follows the field first.
  const followField = useCallback((): FieldSpans => {
    let current = track.current ?? { text: '', spans: [] };
    const value = latest.current?.value;
    if (value !== undefined && value !== lastSeenValue.current) {
      lastSeenValue.current = value;
      current = trackEdit(current, value);
    }
    track.current = current;
    return current;
  }, []);
  const applyEdit = useCallback(
    (edit: (current: FieldSpans) => FieldSpans) => {
      track.current = edit(followField());
      return track.current;
    },
    [followField],
  );
  // The session's own write is what the field now holds, before the form re-renders with it, so neither a later
  // edit in that window nor the re-render is mistaken for the form's own change.
  const write = useCallback((text: string) => {
    const field = latest.current;
    if (!field) return;
    lastSeenValue.current = text;
    latest.current = { ...field, value: text };
    field.onChangeText(text);
  }, []);
  const onChangeText = useCallback(
    (text: string) => write(applyEdit((current) => trackEdit(current, text)).text),
    [applyEdit, write],
  );

  const hold = useCallback((holding: boolean) => {
    held.current = holding;
    setHolding(holding);
  }, []);

  const reset = useCallback(() => {
    applyEdit((current) => ({ text: current.text, spans: [] }));
  }, [applyEdit]);
  const snapshotSaved = useCallback(() => {
    const kept = keptTexts(applyEdit((current) => current));
    return () => {
      const tracked = new Set((track.current?.spans ?? []).map((span) => span.id));
      const reporting = kept.filter(({ id }) => tracked.has(id));
      const reported = new Set(reporting.map(({ id }) => id));
      applyEdit((current) => ({ text: current.text, spans: current.spans.filter((span) => !reported.has(span.id)) }));
      for (const { id, text } of reporting) mutate({ id, text, purpose }, { onError: () => undefined });
    };
  }, [mutate, purpose, applyEdit]);
  const reportSaved = useCallback(() => snapshotSaved()(), [snapshotSaved]);

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
      const attempt = () => ({ business, purpose, ...measured, requestMs: Date.now() - sentAt });
      try {
        const transcription = await transcribeRecording(uri, { business, purpose });
        recordVoiceNoteTranscribed(attempt(), transcription.language);
        const field = latest.current;
        // Its field went while the note was transcribed (the form was cancelled): the transcript lands nowhere, and
        // is not tracked, so nothing a later note or edit does can be attributed to it.
        if (!field) return;
        const { text } = applyEdit((current) =>
          insertTranscript(current, transcription.id, transcription.text, field.maxLength),
        );
        write(text);
      } catch (error) {
        setMessage(error instanceof UploadRefusedError ? error.message : UNAVAILABLE);
        recordVoiceNoteFailed(attempt(), error);
      } finally {
        setTranscribing(false);
      }
    })();
  }, [transcribing, hold, stop, business, purpose, applyEdit, write]);

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
      business,
      purpose,
      attach,
      onChangeText,
      reportSaved,
      snapshotSaved,
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
      business,
      purpose,
      attach,
      onChangeText,
      reportSaved,
      snapshotSaved,
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

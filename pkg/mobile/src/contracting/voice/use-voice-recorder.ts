import { VOICE_NOTE_MAX_SECONDS } from '@pkg/domain/contracting';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useRef, useState } from 'react';

/** Shorter than this is a tap, not a note. */
const MIN_RECORDING_MS = 500;

export type VoiceRecorder = {
  supported: boolean;
  recording: boolean;
  seconds: number;
  permissionDenied: boolean;
  /** Starts recording. A press that had to ask for the microphone records nothing: `allowed` or `denied` says why. */
  start: () => Promise<'recording' | 'allowed' | 'denied'>;
  /** Stops and hands back the recording, or null when there is none worth sending. */
  stop: () => Promise<{ uri: string; seconds: number } | null>;
};

/** Press-and-hold recording through expo-audio, capped at the Voice Note limit. */
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 500);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const starting = useRef<Promise<'recording' | 'allowed' | 'denied'> | null>(null);
  const startedAt = useRef(0);

  const start = useCallback(() => {
    starting.current = (async () => {
      const current = await getRecordingPermissionsAsync();
      if (!current.granted) {
        // The system prompt takes the press; the next hold records.
        const asked = await requestRecordingPermissionsAsync();
        setPermissionDenied(!asked.granted);
        return asked.granted ? 'allowed' : 'denied';
      }
      setPermissionDenied(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: VOICE_NOTE_MAX_SECONDS });
      startedAt.current = Date.now();
      return 'recording' as const;
    })();
    return starting.current;
  }, [recorder]);

  const stop = useCallback(async () => {
    const started = await (starting.current ?? Promise.resolve(null)).catch(() => null);
    starting.current = null;
    if (started !== 'recording') return null;
    // Wall time: the recorder's own duration is gone once the cap has stopped it.
    const durationMs = Math.min(Date.now() - startedAt.current, VOICE_NOTE_MAX_SECONDS * 1000);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    if (!recorder.uri || durationMs < MIN_RECORDING_MS) return null;
    return { uri: recorder.uri, seconds: Math.round(durationMs / 1000) };
  }, [recorder]);

  return {
    supported: true,
    recording: state.isRecording,
    seconds: Math.floor(state.durationMillis / 1000),
    permissionDenied,
    start,
    stop,
  };
}

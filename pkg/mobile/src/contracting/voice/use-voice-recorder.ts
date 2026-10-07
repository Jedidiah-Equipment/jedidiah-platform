import { VOICE_NOTE_MAX_SECONDS } from '@pkg/domain/contracting';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';

/** Shorter than this is a tap, not a note. */
const MIN_RECORDING_MS = 500;
const OPENED_PULSE_MS = 25;

export type VoiceRecorder = {
  recording: boolean;
  seconds: number;
  /** The Voice Note limit has stopped the recording while the finger is still down. */
  capped: boolean;
  /**
   * Starts recording. A press that records nothing says why: `allowed` or `denied` after asking for the microphone,
   * `unsupported` on a build that cannot record.
   */
  start: () => Promise<'recording' | 'allowed' | 'denied' | 'unsupported'>;
  /** Stops and hands back the recording, or null when there is none worth sending. */
  stop: () => Promise<{ uri: string; seconds: number } | null>;
};

/** Press-and-hold recording through expo-audio, capped at the Voice Note limit. */
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 500);
  const starting = useRef<Promise<'recording' | 'allowed' | 'denied'> | null>(null);
  const startedAt = useRef(0);
  const [capped, setCapped] = useState(false);
  const capTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const start = useCallback(() => {
    setCapped(false);
    starting.current = (async () => {
      const current = await getRecordingPermissionsAsync();
      if (!current.granted) {
        // The system prompt takes the press; the next hold records.
        const asked = await requestRecordingPermissionsAsync();
        return asked.granted ? 'allowed' : 'denied';
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: VOICE_NOTE_MAX_SECONDS });
      startedAt.current = Date.now();
      capTimer.current = setTimeout(() => setCapped(true), VOICE_NOTE_MAX_SECONDS * 1000);
      // iOS needs expo-haptics, a native build away (#1668), and mutes haptics once the mic is open.
      if (Platform.OS === 'android') Vibration.vibrate(OPENED_PULSE_MS);
      return 'recording' as const;
    })();
    return starting.current;
  }, [recorder]);

  const stop = useCallback(async () => {
    clearTimeout(capTimer.current);
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

  // Leaving the screen mid-hold must not leave the microphone live until the cap.
  useEffect(
    () => () => {
      if (starting.current) void stop().catch(() => null);
    },
    [stop],
  );

  return {
    recording: state.isRecording,
    seconds: Math.floor(state.durationMillis / 1000),
    capped,
    start,
    stop,
  };
}

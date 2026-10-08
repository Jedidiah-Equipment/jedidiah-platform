import { VOICE_NOTE_MAX_SECONDS } from '@pkg/domain/contracting';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { ImpactFeedbackStyle, impactAsync } from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import { addBreadcrumb } from '@/lib/observability';

/** Shorter than this is a tap, not a note. */
const MIN_RECORDING_MS = 500;
const OPENED_PULSE_MS = 25;
// Metering gives each note a peak input level, so a silent capture can be told from a model that heard nothing.
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export type VoiceRecording = { uri: string; seconds: number; durationMs: number; peakDb: number | null };

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
  stop: () => Promise<VoiceRecording | null>;
};

/** Press-and-hold recording through expo-audio, capped at the Voice Note limit. */
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 500);
  const starting = useRef<Promise<'recording' | 'allowed' | 'denied'> | null>(null);
  const startedAt = useRef(0);
  const peakDb = useRef<number | null>(null);
  const [capped, setCapped] = useState(false);
  const capTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (state.isRecording) keepLoudest(peakDb, state.metering);
  }, [state.isRecording, state.metering]);

  const start = useCallback(() => {
    setCapped(false);
    const pressedAt = Date.now();
    starting.current = (async () => {
      const current = await getRecordingPermissionsAsync();
      if (!current.granted) {
        // The system prompt takes the press; the next hold records.
        const asked = await requestRecordingPermissionsAsync();
        addBreadcrumb('contracting', 'microphone permission asked', { granted: asked.granted });
        return asked.granted ? 'allowed' : 'denied';
      }
      // iOS mutes haptics once the recording audio mode is set, so its tap lands just before the mic opens.
      if (Platform.OS === 'ios') await impactAsync(ImpactFeedbackStyle.Light).catch(() => undefined);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: VOICE_NOTE_MAX_SECONDS });
      startedAt.current = Date.now();
      peakDb.current = null;
      // Words spoken before the mic opens are lost, so a slow start explains a clipped or empty note.
      addBreadcrumb('contracting', 'voice recording started', { startMs: startedAt.current - pressedAt });
      capTimer.current = setTimeout(() => setCapped(true), VOICE_NOTE_MAX_SECONDS * 1000);
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
    keepLoudest(peakDb, recorder.getStatus().metering);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    const peak = peakDb.current === null ? null : Math.round(peakDb.current);
    const uri = durationMs < MIN_RECORDING_MS ? null : recorder.uri || null;
    addBreadcrumb('contracting', 'voice recording stopped', { durationMs, peakDb: peak, kept: uri !== null });
    if (uri === null) return null;
    return { uri, seconds: Math.round(durationMs / 1000), durationMs, peakDb: peak };
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

function keepLoudest(peak: { current: number | null }, level: number | undefined): void {
  if (typeof level !== 'number' || !Number.isFinite(level)) return;
  peak.current = peak.current === null ? level : Math.max(peak.current, level);
}

import { VOICE_NOTE_MAX_SECONDS } from '@pkg/domain/contracting';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'android' }));
const vibrate = vi.hoisted(() => vi.fn());
vi.mock('react-native', () => ({ Platform: platform, Vibration: { vibrate } }));
vi.mock('expo-audio', () => {
  const recorder = {
    prepareToRecordAsync: async () => undefined,
    record: () => undefined,
    stop: async () => undefined,
  };
  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    getRecordingPermissionsAsync: async () => ({ granted: true }),
    requestRecordingPermissionsAsync: async () => ({ granted: true }),
    setAudioModeAsync: async () => undefined,
    useAudioRecorder: () => recorder,
    useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
  };
});

import { useVoiceRecorder, type VoiceRecorder } from './use-voice-recorder';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderRecorder() {
  const current: { recorder?: VoiceRecorder } = {};
  function Probe() {
    current.recorder = useVoiceRecorder();
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return () => current.recorder as VoiceRecorder;
}

beforeEach(() => {
  vi.useFakeTimers();
  vibrate.mockClear();
});
afterEach(() => vi.useRealTimers());

test.each([
  ['android', 1],
  ['ios', 0],
])('pulses the phone as the mic opens on %s %i time(s)', async (os, pulses) => {
  platform.OS = os;
  const recorder = renderRecorder();
  await act(async () => {
    await recorder().start();
  });
  expect(vibrate).toHaveBeenCalledTimes(pulses);
});

test('reports the cap once the Voice Note limit stops a held recording, and clears it on the next press', async () => {
  const recorder = renderRecorder();
  await act(async () => {
    await recorder().start();
  });
  act(() => {
    vi.advanceTimersByTime(VOICE_NOTE_MAX_SECONDS * 1000 - 1);
  });
  expect(recorder().capped).toBe(false);
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(recorder().capped).toBe(true);

  await act(async () => {
    await recorder().stop();
    await recorder().start();
  });
  expect(recorder().capped).toBe(false);
});

test('a recording released before the limit is never reported capped', async () => {
  const recorder = renderRecorder();
  await act(async () => {
    await recorder().start();
    await recorder().stop();
  });
  act(() => {
    vi.advanceTimersByTime(VOICE_NOTE_MAX_SECONDS * 1000);
  });
  expect(recorder().capped).toBe(false);
});

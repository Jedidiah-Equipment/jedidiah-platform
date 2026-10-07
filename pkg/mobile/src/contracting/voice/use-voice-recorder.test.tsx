import { VOICE_NOTE_MAX_SECONDS } from '@pkg/domain/contracting';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'android' }));
const vibrate = vi.hoisted(() => vi.fn());
const addBreadcrumb = vi.hoisted(() => vi.fn());
const recorder = vi.hoisted(() => ({
  uri: 'file:///note.m4a' as string | null,
  metering: -160,
  prepareToRecordAsync: async () => undefined,
  record: () => undefined,
  stop: async () => undefined,
  getStatus() {
    return { metering: this.metering };
  },
}));
vi.mock('react-native', () => ({ Platform: platform, Vibration: { vibrate } }));
vi.mock('@/lib/observability', () => ({ addBreadcrumb }));
vi.mock('expo-audio', () => {
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
  addBreadcrumb.mockClear();
  recorder.metering = -160;
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

test('hands back the length and loudest level of a note, and leaves both in the trail', async () => {
  const voice = renderRecorder();
  await act(async () => {
    await voice().start();
  });
  recorder.metering = -18.4;
  act(() => {
    vi.advanceTimersByTime(2_300);
  });

  let stopped: Awaited<ReturnType<VoiceRecorder['stop']>> = null;
  await act(async () => {
    stopped = await voice().stop();
  });

  expect(stopped).toEqual({ uri: 'file:///note.m4a', seconds: 2, durationMs: 2_300, peakDb: -18 });
  expect(addBreadcrumb).toHaveBeenLastCalledWith('contracting', 'voice recording stopped', {
    durationMs: 2_300,
    peakDb: -18,
    kept: true,
  });
});

test('drops a tap too short to be a note, and says so in the trail', async () => {
  const voice = renderRecorder();
  let stopped: Awaited<ReturnType<VoiceRecorder['stop']>> = null;
  await act(async () => {
    await voice().start();
    stopped = await voice().stop();
  });

  expect(stopped).toBeNull();
  expect(addBreadcrumb).toHaveBeenLastCalledWith('contracting', 'voice recording stopped', {
    durationMs: 0,
    peakDb: -160,
    kept: false,
  });
});

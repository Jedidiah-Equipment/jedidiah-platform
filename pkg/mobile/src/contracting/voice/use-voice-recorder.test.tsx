import { VOICE_NOTE_MAX_SECONDS } from '@pkg/domain/contracting';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'android' }));
const vibrate = vi.hoisted(() => vi.fn());
const impactAsync = vi.hoisted(() => vi.fn(async (_style: string) => undefined));
const setAudioModeAsync = vi.hoisted(() => vi.fn(async (_mode: object) => undefined));
const permission = vi.hoisted(() => ({ granted: true }));
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
vi.mock('expo-haptics', () => ({ impactAsync, ImpactFeedbackStyle: { Light: 'light' } }));
vi.mock('expo-audio', () => {
  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    getRecordingPermissionsAsync: async () => ({ granted: permission.granted }),
    requestRecordingPermissionsAsync: async () => ({ granted: true }),
    setAudioModeAsync,
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
  impactAsync.mockClear();
  setAudioModeAsync.mockClear();
  permission.granted = true;
  addBreadcrumb.mockClear();
  recorder.metering = -160;
});
afterEach(() => vi.useRealTimers());

test.each([
  ['android', 1, 0],
  ['ios', 0, 1],
  ['web', 0, 0],
])('gives one start tap on native and none on web: %s gets %i pulse(s), %i haptic(s)', async (os, pulses, haptics) => {
  platform.OS = os;
  const recorder = renderRecorder();
  await act(async () => {
    await recorder().start();
  });
  expect(vibrate).toHaveBeenCalledTimes(pulses);
  expect(impactAsync).toHaveBeenCalledTimes(haptics);
});

test('taps an iPhone before the recording audio mode mutes haptics', async () => {
  platform.OS = 'ios';
  const recorder = renderRecorder();
  await act(async () => {
    await recorder().start();
  });
  expect(impactAsync).toHaveBeenCalledWith('light');
  expect(impactAsync.mock.invocationCallOrder[0]).toBeLessThan(setAudioModeAsync.mock.invocationCallOrder[0]);
});

test.each(['android', 'ios'])('a press that only asks for the microphone gives no tap on %s', async (os) => {
  platform.OS = os;
  permission.granted = false;
  const recorder = renderRecorder();
  let started: Awaited<ReturnType<VoiceRecorder['start']>> | undefined;
  await act(async () => {
    started = await recorder().start();
  });
  expect(started).toBe('allowed');
  expect(vibrate).not.toHaveBeenCalled();
  expect(impactAsync).not.toHaveBeenCalled();
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

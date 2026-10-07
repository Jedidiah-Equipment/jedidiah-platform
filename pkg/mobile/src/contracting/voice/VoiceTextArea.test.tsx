import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({ offline: false, permitted: true, started: 'recording', capped: false }));
const stop = vi.hoisted(() => vi.fn(async (): Promise<{ uri: string; seconds: number } | null> => null));
const transcribe = vi.hoisted(() => vi.fn());
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@tabler/icons-react-native', () => ({ IconMicrophone: 'IconMicrophone' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));
vi.mock('@/components/form/fields/TextareaField', () => ({ textareaStyle: () => ({}) }));
vi.mock('@/contracting/observability', () => ({ recordVoiceNoteTranscribed: vi.fn() }));
vi.mock('@/lib/connectivity', () => ({ useIsOffline: () => state.offline }));
vi.mock('@/lib/auth-session', () => ({ useSessionPermission: () => state.permitted }));
vi.mock('./transcribe-upload', () => ({ transcribeRecording: transcribe, TranscriptionRefusedError: Error }));
vi.mock('./VoiceFrame', () => ({ VoiceFrame: 'VoiceFrame' }));
vi.mock('./use-voice-recorder', () => ({
  useVoiceRecorder: () => ({
    recording: false,
    seconds: 0,
    capped: state.capped,
    start: async () => state.started,
    stop,
  }),
}));

import { ScrollLockContext } from '@/components/scroll-lock';
import { VoiceTextArea } from './VoiceTextArea';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const voice = {
  purpose: 'field note',
  remember: vi.fn(),
  reportSaved: vi.fn(),
  reset: vi.fn(),
  busy: false,
  setBusy: vi.fn(),
};

function render() {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<VoiceTextArea value="" onChangeText={() => undefined} voice={voice} />);
  });
  return renderer;
}

const mics = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByProps({ accessibilityLabel: 'Hold to record a voice note' });
const micCount = () => mics(render()).length;

beforeEach(() => {
  Object.assign(state, { offline: false, permitted: true, started: 'recording', capped: false });
  stop.mockReset().mockResolvedValue(null);
  voice.setBusy.mockClear();
});

test('offers the mic online to a role that may use voice notes', () => {
  expect(micCount()).toBe(1);
});

test.each([
  ['offline', { offline: true }],
  ['without the permission', { permitted: false }],
])('is a plain text area %s', (_label, change) => {
  Object.assign(state, change);
  expect(micCount()).toBe(0);
});

test('holds the form while recording, and stops a recording whose mic vanished mid-hold', async () => {
  const renderer = render();
  await act(async () => {
    mics(renderer)[0]?.props.onPressIn();
  });
  expect(voice.setBusy).toHaveBeenLastCalledWith(true);

  // The signal drops while the finger is still down: the mic unmounts and its release never fires.
  state.offline = true;
  act(() => {
    renderer.update(<VoiceTextArea value="" onChangeText={() => undefined} voice={voice} />);
  });

  expect(stop).toHaveBeenCalledTimes(1);
  expect(voice.setBusy).toHaveBeenLastCalledWith(false);
});

test('says the web build cannot record, and hands the page its scroll back', async () => {
  state.started = 'unsupported';
  const lockScroll = vi.fn();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <ScrollLockContext.Provider value={lockScroll}>
        <VoiceTextArea value="" onChangeText={() => undefined} voice={voice} />
      </ScrollLockContext.Provider>,
    );
  });
  await act(async () => {
    mics(renderer)[0]?.props.onPressIn();
  });

  expect(lockScroll.mock.calls).toEqual([[true], [false]]);
  expect(renderer.root.findByProps({ accessibilityLiveRegion: 'polite' }).props.children).toBe(
    'Voice notes are not supported in the browser — use the app.',
  );
});

test('animates the frame from the press until the transcript lands, whatever the recorder last polled', async () => {
  let land!: (transcription: { text: string }) => void;
  transcribe.mockReturnValue(new Promise((resolve) => (land = resolve)));
  stop.mockResolvedValue({ uri: 'file://note.m4a', seconds: 3 });
  const renderer = render();
  const animating = () => renderer.root.findByType('VoiceFrame' as never).props.animating;
  expect(animating()).toBe(false);

  await act(async () => {
    mics(renderer)[0]?.props.onPressIn();
  });
  expect(animating()).toBe(true);

  await act(async () => {
    mics(renderer)[0]?.props.onPressOut();
  });
  expect(animating()).toBe(true);

  await act(async () => land({ text: 'Fence down by the dam.' }));
  expect(animating()).toBe(false);
});

test('stops animating when the Voice Note limit cuts off a note the finger still holds', async () => {
  const renderer = render();
  const animating = () => renderer.root.findByType('VoiceFrame' as never).props.animating;
  await act(async () => {
    mics(renderer)[0]?.props.onPressIn();
  });
  expect(animating()).toBe(true);

  state.capped = true;
  act(() => {
    renderer.update(<VoiceTextArea value="" onChangeText={() => undefined} voice={voice} />);
  });
  expect(animating()).toBe(false);
});

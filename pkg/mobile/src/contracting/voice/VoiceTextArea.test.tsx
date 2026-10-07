import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({ offline: false, permitted: true }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@tabler/icons-react-native', () => ({ IconMicrophone: 'IconMicrophone' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));
vi.mock('@/components/form/fields/TextareaField', () => ({ textareaStyle: () => ({}) }));
vi.mock('@/lib/connectivity', () => ({ useIsOffline: () => state.offline }));
vi.mock('@/lib/auth-session', () => ({ useSessionPermission: () => state.permitted }));
vi.mock('./VoiceFrame', () => ({ VoiceFrame: 'VoiceFrame' }));

import { ScrollLockContext } from '@/components/scroll-lock';
import type { VoiceSession } from './use-voice-session';
import { VoiceTextArea } from './VoiceTextArea';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const voice: VoiceSession = {
  purpose: 'field note',
  value: '',
  onChangeText: vi.fn(),
  reportSaved: vi.fn(),
  reset: vi.fn(),
  busy: false,
  transcribing: false,
  listening: false,
  status: 'Hold to record a voice note',
  onPressIn: vi.fn(),
  onPressOut: vi.fn(),
  cancel: vi.fn(),
};

function render(session: VoiceSession = voice, lockScroll = vi.fn()) {
  let renderer!: ReactTestRenderer;
  const tree = (current: VoiceSession) => (
    <ScrollLockContext.Provider value={lockScroll}>
      <VoiceTextArea voice={current} />
    </ScrollLockContext.Provider>
  );
  act(() => {
    renderer = create(tree(voice));
  });
  if (session !== voice)
    act(() => {
      renderer.update(tree(session));
    });
  return renderer;
}

const mics = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByProps({ accessibilityLabel: 'Hold to record a voice note' });
const micCount = () => mics(render()).length;

beforeEach(() => {
  Object.assign(state, { offline: false, permitted: true });
  vi.clearAllMocks();
});

test('offers the mic online to a role that may use voice notes, and holds the page still while it is pressed', () => {
  const lockScroll = vi.fn();
  const renderer = render(voice, lockScroll);
  const [mic] = mics(renderer);
  expect(renderer.root.findByProps({ accessibilityLiveRegion: 'polite' }).props.children).toBe(voice.status);
  expect(voice.cancel).not.toHaveBeenCalled();

  act(() => mic?.props.onPressIn());
  expect(voice.onPressIn).toHaveBeenCalledOnce();
  act(() => mic?.props.onPressOut());
  expect(voice.onPressOut).toHaveBeenCalledOnce();
  expect(lockScroll.mock.calls).toEqual([[true], [false]]);
});

test('lets the page scroll again once a press the recorder could not take ends', () => {
  const lockScroll = vi.fn();
  const renderer = render(voice, lockScroll);
  act(() => mics(renderer)[0]?.props.onPressIn());
  expect(lockScroll.mock.calls).toEqual([[true]]);

  // The session took the hold, then let it go without a release: the mic was denied or unsupported.
  act(() => {
    renderer.update(
      <ScrollLockContext.Provider value={lockScroll}>
        <VoiceTextArea voice={{ ...voice, busy: true }} />
      </ScrollLockContext.Provider>,
    );
  });
  act(() => {
    renderer.update(
      <ScrollLockContext.Provider value={lockScroll}>
        <VoiceTextArea voice={{ ...voice, busy: false }} />
      </ScrollLockContext.Provider>,
    );
  });
  expect(lockScroll.mock.calls).toEqual([[true], [false]]);
});

test.each([
  ['offline', { offline: true }],
  ['without the permission', { permitted: false }],
])('is a plain text area %s', (_label, change) => {
  Object.assign(state, change);
  expect(micCount()).toBe(0);
});

test('drops a recording whose mic vanished mid-hold, and one whose field unmounted', () => {
  const lockScroll = vi.fn();
  const renderer = render(voice, lockScroll);
  act(() => mics(renderer)[0]?.props.onPressIn());
  // The signal drops while the finger is still down: the mic unmounts and its release never fires.
  state.offline = true;
  act(() => {
    renderer.update(
      <ScrollLockContext.Provider value={lockScroll}>
        <VoiceTextArea voice={{ ...voice, busy: true }} />
      </ScrollLockContext.Provider>,
    );
  });
  expect(voice.cancel).toHaveBeenCalledTimes(1);
  expect(lockScroll.mock.calls).toEqual([[true], [false]]);

  act(() => renderer.unmount());
  expect(voice.cancel).toHaveBeenCalledTimes(2);
});

test('animates the frame while listening or transcribing, and locks typing while transcribing', () => {
  const animating = (renderer: ReactTestRenderer) => renderer.root.findByType('VoiceFrame' as never).props.animating;
  expect(animating(render())).toBe(false);
  expect(animating(render({ ...voice, listening: true, busy: true }))).toBe(true);

  const transcribing = render({ ...voice, transcribing: true, busy: true });
  expect(animating(transcribing)).toBe(true);
  expect(transcribing.root.findByType('TextInput' as never).props.editable).toBe(false);
  expect(mics(transcribing)[0]?.props.disabled).toBe(true);
});

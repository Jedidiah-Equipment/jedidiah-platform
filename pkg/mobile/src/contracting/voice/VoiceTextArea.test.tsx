import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({ offline: false, permitted: true, supported: true }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@tabler/icons-react-native', () => ({ IconMicrophone: 'IconMicrophone' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));
vi.mock('@/components/form/fields/TextareaField', () => ({ textareaStyle: () => ({}) }));
vi.mock('@/contracting/observability', () => ({ recordVoiceNoteTranscribed: vi.fn() }));
vi.mock('@/lib/connectivity', () => ({ useIsOffline: () => state.offline }));
vi.mock('@/lib/auth-session', () => ({ useSessionPermission: () => state.permitted }));
vi.mock('./transcribe-upload', () => ({ transcribeRecording: vi.fn(), TranscriptionRefusedError: Error }));
vi.mock('./use-voice-recorder', () => ({
  useVoiceRecorder: () => ({
    supported: state.supported,
    recording: false,
    seconds: 0,
    start: async () => 'recording',
    stop: async () => null,
  }),
}));

import { VoiceTextArea } from './VoiceTextArea';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const voice = { purpose: 'field note', remember: vi.fn(), reportSaved: vi.fn(), reset: vi.fn() };

function micCount() {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<VoiceTextArea value="" onChangeText={() => undefined} voice={voice} />);
  });
  return renderer.root.findAllByProps({ accessibilityLabel: 'Hold to record a voice note' }).length;
}

beforeEach(() => {
  Object.assign(state, { offline: false, permitted: true, supported: true });
});

test('offers the mic online to a role that may use voice notes', () => {
  expect(micCount()).toBe(1);
});

test.each([
  ['offline', { offline: true }],
  ['without the permission', { permitted: false }],
  ['on the web build', { supported: false }],
])('is a plain text area %s', (_label, change) => {
  Object.assign(state, change);
  expect(micCount()).toBe(0);
});

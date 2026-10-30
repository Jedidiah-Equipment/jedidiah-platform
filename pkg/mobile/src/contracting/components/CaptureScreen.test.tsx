import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'm1' }),
  useNavigation: () => ({ isFocused: () => true }),
  router: { dismissTo: vi.fn() },
}));
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/components/FormPage', () => ({
  FormPage: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => (
    <>
      {children}
      {footer}
    </>
  ),
}));
vi.mock('@/components/form/fields/FieldShell', () => ({
  FieldLabel: 'FieldLabel',
  FieldShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/TopToolbar', () => ({ SecondaryToolbar: 'Toolbar' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));
vi.mock('@/components/voice/use-voice-session', () => ({
  useVoiceSession: () => ({ busy: false, reportSaved: vi.fn() }),
}));
vi.mock('@/components/voice/VoiceTextArea', () => ({ VoiceTextArea: 'VoiceTextArea' }));
vi.mock('@/contracting/components/ReadAtField', () => ({ ReadAtField: 'ReadAtField' }));
vi.mock('@/contracting/components/StintOverrideCard', () => ({
  StintOverrideCard: 'StintOverrideCard',
  useStintOverrides: () => ({ value: undefined }),
}));
vi.mock('@/contracting/observability', () => ({ recordReadingCaptured: vi.fn() }));
const upload = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
vi.mock('@/contracting/readings/reading-upload', () => ({ CAPTURE_FAILED: 'failed', captureReading: upload }));
vi.mock('@/contracting/readings/use-fleet', () => ({
  useFleet: () => ({ data: [{ id: 'm1', code: 'T1' }] }),
  useLatestReading: () => ({
    canRead: true,
    data: { id: 'latest', value: 100, capturedAt: '2026-10-29T08:00:00.000Z', telematicsProvider: null },
  }),
  useReadAtEstimate: (_target: unknown, value: number | null) => ({
    estimate: value === null ? undefined : { kind: 'now' },
    working: false,
    isError: false,
  }),
}));
vi.mock('@/lib/auth-session', () => ({ useSessionPermission: () => true }));
vi.mock('@/lib/multipart-upload', () => ({ UploadRefusedError: class extends Error {} }));
vi.mock('@/lib/trpc', () => ({
  useTRPC: () => ({
    contractingReadings: { pathKey: () => ['readings'] },
    contractingJobs: { pathKey: () => ['jobs'] },
  }),
}));
vi.mock('@/lib/use-busy-action', () => ({
  useBusyAction: () => ({ busy: false, error: null, run: (action: () => Promise<void>) => action() }),
}));

import MachineCaptureScreen from './CaptureScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const buttonTitles = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType('Button' as never).map((button) => button.props.title);
const pressButton = async (renderer: ReactTestRenderer, title: string) => {
  const button = renderer.root.findAllByType('Button' as never).find((item) => item.props.title === title);
  if (!button) throw new Error(`Button missing: ${title}`);
  await act(async () => button.props.onPress());
};

test('reveals when, hours, the date to vouch for, then the details, and saves the confirmed date', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<MachineCaptureScreen />);
  });
  expect(renderer.root.findAllByType('TextInput' as never)).toHaveLength(0);
  expect(buttonTitles(renderer)).toEqual([]);
  const [today] = renderer.root.findAllByType('Pressable' as never);
  await act(async () => today?.props.onPress());
  expect(today?.props.accessibilityState).toMatchObject({ selected: true });
  const input = renderer.root.findByType('TextInput' as never);
  await act(async () => input.props.onChangeText('120'));
  expect(buttonTitles(renderer)).toEqual(['Read now', 'Date looks good']);
  expect(renderer.root.findAllByType('VoiceTextArea' as never)).toHaveLength(0);
  await pressButton(renderer, 'Date looks good');
  expect(renderer.root.findAllByType('VoiceTextArea' as never)).toHaveLength(1);
  await pressButton(renderer, 'Save reading');
  expect(upload).toHaveBeenCalledWith(
    expect.objectContaining({ machineId: 'm1', role: 'spot', value: 120, disputePrevious: false }),
  );
  await act(async () => renderer.unmount());
});

import { departureBeforeArrivalSentence } from '@pkg/domain/contracting';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';

const params = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => params.current, router: { dismissTo: vi.fn() } }));
vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('@/components/FormPage', () => ({
  FormPage: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => (
    <>
      {children}
      {footer}
    </>
  ),
}));
vi.mock('@/components/form/fields/FieldShell', () => ({
  FieldShell: ({ children, errors }: { children: ReactNode; errors?: { message: string }[] }) => (
    <>
      {children}
      {errors?.map((error) => (
        <Text key={error.message}>{error.message}</Text>
      ))}
    </>
  ),
}));
vi.mock('@/components/TopToolbar', () => ({ SecondaryToolbar: 'Toolbar' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));
vi.mock('@/components/voice/use-voice-session', () => ({
  useVoiceSession: () => ({ busy: false, reportSaved: vi.fn() }),
}));
vi.mock('@/components/voice/VoiceTextArea', () => ({ VoiceTextArea: 'VoiceTextArea' }));
vi.mock('@/contracting/components/StintOverrideCard', () => ({
  StintOverrideCard: 'StintOverrideCard',
  useStintOverrides: () => ({ value: undefined }),
}));
vi.mock('@/contracting/readings/use-fleet', () => ({
  useLatestTelematics: () => ({ data: { hours: 4512, at: '2026-10-28T12:05:00.000Z' } }),
}));
const writes = vi.hoisted(() => ({ capture: vi.fn(async () => null), edit: vi.fn(async () => null) }));
const job = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('./use-jobs', () => ({
  useJob: () => ({ data: job.current, gone: false }),
  useStintHoursWrites: () => ({ capture: { mutateAsync: writes.capture }, edit: { mutateAsync: writes.edit } }),
}));
vi.mock('@/lib/use-busy-action', () => ({
  useBusyAction: () => ({ busy: false, error: null, run: (action: () => Promise<void>) => action() }),
}));

import { Text } from '@/components/ui/text';
import StintHoursScreen from './StintHoursScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reading = (hours: number) => ({ hours, at: '2026-10-28T08:00:00.000Z', comment: null });
const stint = { id: 's1', machineId: 'm1', machineCode: 'JD8R-1', arrival: reading(4400), departure: null };
const renderers: ReactTestRenderer[] = [];
afterEach(async () => {
  for (const renderer of renderers.splice(0)) await act(async () => renderer.unmount());
  writes.capture.mockClear();
  writes.edit.mockClear();
});

async function mount(screen: Record<string, string>, status = 'active', assignment: object = stint) {
  params.current = { jobId: 'j1', assignmentId: 's1', ...screen };
  job.current = { status, johnDeereDifferenceThresholdHours: 10, assignments: [assignment] };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<StintHoursScreen />);
  });
  renderers.push(renderer);
  return renderer;
}
const texts = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType('Text' as never).map((node) => [node.props.children].flat().join(''));
const input = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAll((node) => node.type === ('TextInput' as never) && node.props.accessibilityLabel === label)[0];
const saveButton = (renderer: ReactTestRenderer) => renderer.root.findByType('Button' as never);

test('a departure shows John Deere, refuses one below the arrival and warns far from Deere', async () => {
  const renderer = await mount({ role: 'departure' });
  expect(texts(renderer).some((line) => line.startsWith('John Deere read 4 512.0 h'))).toBe(true);

  await act(async () => input(renderer, 'Departure hours')?.props.onChangeText('4380'));
  expect(texts(renderer)).toContain(departureBeforeArrivalSentence(4400));
  expect(saveButton(renderer).props.disabled).toBe(true);

  await act(async () => input(renderer, 'Departure hours')?.props.onChangeText('4480'));
  expect(texts(renderer).some((line) => line.startsWith('That is 32.0 h away from John Deere'))).toBe(true);
  expect(saveButton(renderer).props.disabled).toBe(false);
  await act(async () => saveButton(renderer).props.onPress());
  expect(writes.capture).toHaveBeenCalledWith({ assignmentId: 's1', role: 'departure', hours: 4480, comment: null });
});

test('editing hours on a Completed Job asks for a reason before it saves', async () => {
  const renderer = await mount({ mode: 'edit' }, 'completed', { ...stint, departure: reading(4500) });
  const reason = input(renderer, 'Reason');
  expect(reason).toBeDefined();
  expect(saveButton(renderer).props.disabled).toBe(true);
  await act(async () => reason?.props.onChangeText('Misread the meter'));
  await act(async () => saveButton(renderer).props.onPress());
  expect(writes.edit).toHaveBeenCalledWith(
    expect.objectContaining({ arrivalHours: 4400, departureHours: 4500, reason: 'Misread the meter' }),
  );
});

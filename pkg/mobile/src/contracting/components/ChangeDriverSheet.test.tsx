import type { FieldMachine } from '@pkg/schema/contracting';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/switch', () => ({ Switch: 'Switch' }));
vi.mock('@/components/ui/toast', () => ({ useAppToast: () => vi.fn() }));
vi.mock('@/lib/observability', () => ({ captureException: vi.fn() }));
vi.mock('@/components/ModalSheet', () => ({
  ModalSheet: ({
    children,
    error,
    footer,
  }: {
    children: React.ReactNode;
    error: string | null;
    footer: React.ReactNode;
  }) => (
    <>
      {error ? <Text testID="error">{error}</Text> : null}
      {children}
      {footer}
    </>
  ),
  SheetSubmitButton: 'SheetSubmitButton',
}));
vi.mock('@/components/form/fields/CurrencyField', () => ({ CurrencyField: 'CurrencyField' }));
vi.mock('@/components/form/fields/DateField', () => ({ DateField: 'DateField' }));
vi.mock('@/components/form/fields/MultiSelectField', () => ({ MultiSelectField: 'MultiSelectField' }));
vi.mock('@/components/form/fields/SearchSelectField', () => ({ SearchSelectField: 'SearchSelectField' }));
vi.mock('@/components/form/fields/SegmentedField', () => ({ SegmentedField: 'SegmentedField' }));
vi.mock('@/components/form/fields/SelectField', () => ({ SelectField: 'SelectField' }));
vi.mock('@/components/form/fields/TextareaField', () => ({ TextareaField: 'TextareaField' }));
vi.mock('@/components/form/fields/TextField', () => ({ TextField: 'TextField' }));
vi.mock('@/contracting/jobs/use-jobs', () => ({ useDrivers: () => ({ data: [], isError: false }) }));
const changeDriver = vi.hoisted(() => vi.fn(async (_input: unknown) => ({ onSiteRefusal: null as string | null })));
vi.mock('@/contracting/readings/use-fleet', () => ({ useChangeMachineDriver: () => ({ mutateAsync: changeDriver }) }));

import { Text } from '@/components/ui/text';
import { ChangeDriverSheet } from './ChangeDriverSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const renderers: ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount());
  changeDriver.mockClear();
});

const machineId = '00000000-0000-4000-8000-000000000001';

function mount(onSiteJobNumber: string | null) {
  const machine = {
    id: machineId,
    code: 'CAT320-1',
    currentDriverUserId: 'driver-1',
    busyOnJob: null,
    onSiteJobNumber,
  } as FieldMachine;
  const onClose = vi.fn();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ChangeDriverSheet machine={machine} onClose={onClose} />);
  });
  renderers.push(renderer);
  const submit = () => act(async () => renderer.root.findByType('SheetSubmitButton' as never).props.onPress());
  return { renderer, onClose, submit };
}

test('in the yard there is no on-site switch and only the default changes', async () => {
  const { renderer, submit } = mount(null);
  expect(renderer.root.findAllByType('Switch' as never)).toEqual([]);
  await submit();
  expect(changeDriver).toHaveBeenCalledWith({ machineId, driverUserId: 'driver-1', onSite: false });
});

test('on site the switch starts on and can be turned off', async () => {
  const { renderer, submit } = mount('CJOB-7');
  const toggle = renderer.root.findByType('Switch' as never);
  expect(toggle.props.value).toBe(true);
  act(() => toggle.props.onValueChange(false));
  await submit();
  expect(changeDriver).toHaveBeenCalledWith({ machineId, driverUserId: 'driver-1', onSite: false });
});

test('a refused stint keeps the sheet open with the refusal', async () => {
  changeDriver.mockResolvedValueOnce({ onSiteRefusal: 'The Job is completed.' });
  const { renderer, onClose, submit } = mount('CJOB-7');
  await submit();
  expect(changeDriver).toHaveBeenCalledWith({ machineId, driverUserId: 'driver-1', onSite: true });
  expect(onClose).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ testID: 'error' }).props.children).toContain('The Job is completed.');
});

import { NEXT_SERVICE_DUE_BELOW_READING_MESSAGE, type ServiceRecord } from '@pkg/schema/contracting';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));
vi.mock('@/components/ui/toast', () => ({ useAppToast: () => vi.fn() }));
vi.mock('@/lib/observability', () => ({ captureException: vi.fn() }));
vi.mock('@/components/ModalSheet', () => ({
  ModalSheet: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => (
    <>
      {children}
      {footer}
    </>
  ),
  SheetSubmitButton: 'SheetSubmitButton',
}));
// Only the two hour fields are under test; the rest hold native pickers.
vi.mock('@/components/form/fields/CurrencyField', () => ({ CurrencyField: 'CurrencyField' }));
vi.mock('@/components/form/fields/DateField', () => ({ DateField: 'DateField' }));
vi.mock('@/components/form/fields/MultiSelectField', () => ({ MultiSelectField: 'MultiSelectField' }));
vi.mock('@/components/form/fields/SearchSelectField', () => ({ SearchSelectField: 'SearchSelectField' }));
vi.mock('@/components/form/fields/SegmentedField', () => ({ SegmentedField: 'SegmentedField' }));
vi.mock('@/components/form/fields/SelectField', () => ({ SelectField: 'SelectField' }));
vi.mock('@/components/form/fields/TextareaField', () => ({ TextareaField: 'TextareaField' }));
vi.mock('@/components/form/fields/TextField', () => ({ TextField: 'TextField' }));
const close = vi.hoisted(() => vi.fn(async (_input: unknown) => undefined));
vi.mock('./use-services', () => ({
  useServiceMechanicOptions: () => [],
  useServiceMutation: () => ({ mutateAsync: close }),
}));

import { CloseServiceSheet } from './CloseServiceSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const renderers: ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount());
  close.mockClear();
});

const record = {
  id: '00000000-0000-4000-8000-000000000001',
  primaryMechanicUserId: null,
  mechanicName: null,
  notes: null,
} as ServiceRecord;

function mount(serviceIntervalHours: number | null, knownHours: number | null = null) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <CloseServiceSheet record={record} machine={{ knownHours, serviceIntervalHours }} onClose={vi.fn()} />,
    );
  });
  renderers.push(renderer);
  const [reading, due] = renderer.root.findAllByType('TextInput' as never) as [ReactTestInstance, ReactTestInstance];
  return { renderer, reading, due };
}

async function type(input: ReactTestInstance, value: string) {
  await act(async () => {
    input.props.onFocus();
    input.props.onChangeText(value);
    input.props.onBlur();
  });
}

async function submit(renderer: ReactTestRenderer) {
  await act(async () => renderer.root.findByType('SheetSubmitButton' as never).props.onPress());
}

test('Next service due pre-fills from the interval until it is typed over', async () => {
  const { reading, due } = mount(250);
  await type(reading, '1450');
  expect(due.props.value).toBe('1700');
  await type(due, '1720');
  await type(reading, '1460');
  expect(due.props.value).toBe('1720');
});

test('opens on Known Hours as the reading, and the Next service due they suggest, both still editable', async () => {
  const { renderer, reading, due } = mount(250, 7251);
  expect(reading.props.value).toBe('7251');
  expect(due.props.value).toBe('7501');
  await type(reading, '7260');
  expect(due.props.value).toBe('7510');
  await submit(renderer);
  expect(close).toHaveBeenCalledWith(
    expect.objectContaining({ id: record.id, readingAtServiceHours: 7260, nextServiceDueHours: 7510 }),
  );
});

test('will not close with Next service due below the reading', async () => {
  const { renderer, reading, due } = mount(null);
  await type(reading, '1450');
  expect(due.props.value).toBe('');
  await type(due, '1400');
  await submit(renderer);
  expect(close).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain(NEXT_SERVICE_DUE_BELOW_READING_MESSAGE);
  await type(due, '1700');
  await submit(renderer);
  expect(close).toHaveBeenCalledWith(
    expect.objectContaining({ id: record.id, readingAtServiceHours: 1450, nextServiceDueHours: 1700 }),
  );
});

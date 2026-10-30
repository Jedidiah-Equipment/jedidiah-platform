import type { AssignmentDetail } from '@pkg/schema/contracting';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@tabler/icons-react-native', () => ({
  IconCheck: 'IconCheck',
  IconChevronDown: 'IconChevronDown',
  IconTrash: 'IconTrash',
}));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
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
// Only the Measure Type and quantity fields are under test; the rest hold native pickers.
vi.mock('@/components/form/fields/CurrencyField', () => ({ CurrencyField: 'CurrencyField' }));
vi.mock('@/components/form/fields/DateField', () => ({ DateField: 'DateField' }));
vi.mock('@/components/form/fields/MultiSelectField', () => ({ MultiSelectField: 'MultiSelectField' }));
vi.mock('@/components/form/fields/SearchSelectField', () => ({ SearchSelectField: 'SearchSelectField' }));
vi.mock('@/components/form/fields/SegmentedField', () => ({ SegmentedField: 'SegmentedField' }));
vi.mock('@/components/form/fields/TextareaField', () => ({ TextareaField: 'TextareaField' }));
vi.mock('@/components/form/fields/TextField', () => ({ TextField: 'TextField' }));
const writes = vi.hoisted(() => ({
  set: vi.fn(async (_input: unknown) => undefined),
  remove: vi.fn(async (_input: unknown) => undefined),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ write }: { write: keyof typeof writes }) => ({ mutateAsync: writes[write] }),
}));
vi.mock('@/lib/trpc', () => ({
  useTRPC: () => ({
    contractingJobs: {
      pathKey: () => ['contractingJobs'],
      measures: {
        set: { mutationOptions: () => ({ write: 'set' }) },
        remove: { mutationOptions: () => ({ write: 'remove' }) },
      },
    },
  }),
}));
const hectaresId = '00000000-0000-4000-8000-0000000000a1';
const loadsId = '00000000-0000-4000-8000-0000000000a2';
vi.mock('./use-jobs', () => ({
  useMeasureTypes: () => ({
    data: [
      { id: hectaresId, name: 'Hectares' },
      { id: loadsId, name: 'Loads' },
    ],
    isError: false,
  }),
}));

import { MeasuresSheet } from './MeasuresSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const renderers: ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount());
  writes.set.mockClear();
  writes.remove.mockClear();
});

const stint = {
  id: '00000000-0000-4000-8000-000000000001',
  machineCode: 'T12',
  implementCode: null,
  measures: [{ id: 'm1', measureTypeId: hectaresId, measureTypeName: 'Hectares', quantity: 12.5 }],
} as unknown as AssignmentDetail;

const text = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : text(child))).join('');

async function press(renderer: ReactTestRenderer, label: string) {
  const [button] = renderer.root.findAll(
    (node) => node.type === ('Pressable' as never) && (node.props.accessibilityLabel === label || text(node) === label),
  );
  if (!button) throw new Error(`No button "${label}"`);
  await act(async () => button.props.onPress());
}

function mount() {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<MeasuresSheet stint={stint} onClose={vi.fn()} />);
  });
  renderers.push(renderer);
  return renderer;
}

test('choosing a recorded Measure Type edits it, starting from its quantity', async () => {
  const renderer = mount();
  await press(renderer, 'Choose a Measure Type');
  await press(renderer, 'Hectares (editing)');
  const quantity = renderer.root.findByType('TextInput' as never);
  expect(quantity.props.value).toBe('12.5');
  await act(async () => {
    quantity.props.onFocus();
    quantity.props.onChangeText('14');
    quantity.props.onBlur();
  });
  await act(async () => renderer.root.findByType('SheetSubmitButton' as never).props.onPress());
  expect(writes.set).toHaveBeenCalledWith({ assignmentId: stint.id, measureTypeId: hectaresId, quantity: 14 });
});

test('will not save without a Measure Type, and removes a recorded one', async () => {
  const renderer = mount();
  await act(async () => renderer.root.findByType('SheetSubmitButton' as never).props.onPress());
  expect(writes.set).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain('Choose a Measure Type');
  await press(renderer, 'Remove Hectares');
  expect(writes.remove).toHaveBeenCalledWith({ assignmentId: stint.id, measureTypeId: hectaresId });
});

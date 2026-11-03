import type { AssignmentDetail } from '@pkg/schema/contracting';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('@/components/form/fields/FieldShell', () => ({
  FieldShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));
vi.mock('@/components/ui/themed-modal', () => ({
  ThemedModal: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/lib/observability', () => ({ captureException: vi.fn() }));
const remove = vi.hoisted(() => vi.fn(async (_input: unknown) => undefined));
vi.mock('./use-jobs', () => ({ useRemoveStint: () => ({ mutateAsync: remove }) }));

import { RemoveStintDialog } from './RemoveStintDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  remove.mockClear();
});

async function open(state: AssignmentDetail['state']) {
  const onClose = vi.fn();
  const stint = { id: 's1', machineCode: 'MF-04', state } as AssignmentDetail;
  await act(async () => {
    renderer = create(<RemoveStintDialog stint={stint} open onClose={onClose} />);
  });
  const root = (renderer as ReactTestRenderer).root;
  const button = () => root.findAll((node: ReactTestInstance) => node.props.title === 'Remove')[0] as ReactTestInstance;
  return { root, button, onClose };
}

test('a planned Machine comes off with a plain confirm', async () => {
  const { root, button, onClose } = await open('planned');
  expect(root.findAllByType('TextInput' as never)).toHaveLength(0);
  await act(async () => button().props.onPress());
  expect(remove).toHaveBeenCalledWith({ id: 's1' });
  expect(onClose).toHaveBeenCalled();
});

test('a Machine that has arrived needs a reason before it can come off', async () => {
  const { root, button } = await open('left');
  expect(button().props.disabled).toBe(true);
  await act(async () => root.findByType('TextInput' as never).props.onChangeText('  Added by accident '));
  expect(button().props.disabled).toBe(false);
  await act(async () => button().props.onPress());
  expect(remove).toHaveBeenCalledWith({ id: 's1', reason: 'Added by accident' });
});

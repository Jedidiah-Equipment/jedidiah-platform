import { describe, expect, test, vi } from 'vitest';

vi.mock('@tabler/icons-react-native', () => ({
  IconCloudDownload: 'IconCloudDownload',
  IconRefreshAlert: 'IconRefreshAlert',
}));
vi.mock('react-native', () => ({ ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', View: 'View' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/themed-modal', () => ({ ThemedModal: 'ThemedModal' }));

const useAppUpdate = vi.fn();
vi.mock('@/lib/use-app-update', () => ({ useAppUpdate: () => useAppUpdate() }));

import { UpdatePrompt, updateDismissLabel, updateInstallLabel } from './UpdatePrompt';

type TestElement = React.ReactElement<{ children?: unknown; [key: string]: unknown }>;

function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === 'object' && 'props' in node) {
    return texts((node as TestElement).props.children);
  }
  return [];
}

function pressables(node: unknown): TestElement[] {
  if (Array.isArray(node)) return node.flatMap(pressables);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];

  const element = node as TestElement;
  const nested = pressables(element.props.children);
  return element.type === 'Pressable' ? [element, ...nested] : nested;
}

function press(button: TestElement): void {
  (button.props.onPress as () => void)();
}

describe('UpdatePrompt', () => {
  test('renders nothing while the running version is the newest one', () => {
    useAppUpdate.mockReturnValue({ dismiss: vi.fn(), install: vi.fn(), prompt: { kind: 'hidden' } });

    expect(UpdatePrompt()).toBeNull();
  });

  test('offers the update, installs on accept, and names the update it dismisses', () => {
    const dismiss = vi.fn();
    const install = vi.fn();
    useAppUpdate.mockReturnValue({ dismiss, install, prompt: { kind: 'offered', updateKey: 'update-2' } });

    const prompt = UpdatePrompt() as TestElement;
    const buttons = pressables(prompt.props.children);

    expect(texts(buttons[0])).toEqual([updateDismissLabel]);
    expect(texts(buttons[1])).toEqual([updateInstallLabel]);

    press(buttons[1]);
    expect(install).toHaveBeenCalled();

    press(buttons[0]);
    expect(dismiss).toHaveBeenCalledWith('update-2');
  });

  // A download on a bad signal can run for minutes; the app must not be locked behind it.
  test('keeps a way out while installing, with the install action busy', () => {
    const dismiss = vi.fn();
    useAppUpdate.mockReturnValue({
      dismiss,
      install: vi.fn(),
      prompt: { kind: 'installing', updateKey: 'update-2' },
    });

    const prompt = UpdatePrompt() as TestElement;
    const buttons = pressables(prompt.props.children);

    expect(prompt.props.dismissDisabled).toBeUndefined();
    expect(buttons[1].props.disabled).toBe(true);

    press(buttons[0]);
    expect(dismiss).toHaveBeenCalledWith('update-2');
  });
});

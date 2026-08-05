import type { ReactElement } from 'react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => ({ current: null }),
  useState: <Value,>(initial: Value) => [initial, vi.fn()],
}));
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@tabler/icons-react-native', () => ({
  IconCheck: 'IconCheck',
  IconChevronDown: 'IconChevronDown',
  IconSearch: 'IconSearch',
}));
vi.mock('@/components/ui/anchored-menu', () => ({ AnchoredMenu: 'AnchoredMenu' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));

import { ListSearchControl } from './ListControls';

describe('ListSearchControl', () => {
  test('pins the native input content to the same horizontal origin as its overlay placeholder', () => {
    const control = ListSearchControl({
      accessibilityLabel: 'Search jobs',
      onChangeText: vi.fn(),
      placeholder: 'Search jobs',
      value: '',
    }) as ReactElement<{ children: ReactElement[] }>;
    const inputWrapper = control.props.children[1] as ReactElement<{ children: ReactElement[] }>;
    const input = inputWrapper.props.children[0] as ReactElement<{ style?: unknown }>;

    expect(input.props.style).toEqual({ paddingHorizontal: 0, paddingVertical: 0 });
  });
});

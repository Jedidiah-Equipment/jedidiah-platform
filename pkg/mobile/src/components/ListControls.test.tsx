import { IconCheck } from '@tabler/icons-react-native';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const menuState = vi.hoisted(() => ({
  anchor: null as { right: number; top: number; bottom: number } | null,
  height: 800,
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => ({ current: null }),
  useState: <Value,>(initial: Value) => [initial === null ? menuState.anchor : initial, vi.fn()],
}));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  View: 'View',
  useWindowDimensions: () => ({ width: 400, height: menuState.height }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }),
}));
vi.mock('@tabler/icons-react-native', () => ({
  IconCheck: 'IconCheck',
  IconChevronDown: 'IconChevronDown',
  IconSearch: 'IconSearch',
}));
vi.mock('@/components/ui/anchored-menu', () => ({ AnchoredMenu: 'AnchoredMenu' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));

import { ListDropdownControl, ListSearchControl } from './ListControls';

afterEach(() => {
  menuState.anchor = null;
  menuState.height = 800;
});

describe('ListDropdownControl', () => {
  test.each([
    { height: 800, anchor: { right: 380, top: 132, bottom: 188 }, position: { top: 188 }, maxHeight: 584 },
    { height: 320, anchor: { right: 380, top: 212, bottom: 268 }, position: { bottom: 108 }, maxHeight: 180 },
  ])(
    'keeps a long category list scrollable within a $height-pixel viewport',
    ({ height, anchor, position, maxHeight }) => {
      menuState.height = height;
      menuState.anchor = anchor;
      const onChange = vi.fn();
      const options = Array.from({ length: 30 }, (_, index) => ({ label: `Category ${index}`, value: `${index}` }));
      const control = ListDropdownControl({
        accessibilityLabel: 'Category',
        defaultValue: 'all',
        dismissLabel: 'Dismiss categories',
        icon: IconCheck,
        onChange,
        options,
        value: 'all',
      });
      const menu = control.props.children[1];
      expect(menu.props.style).toMatchObject(position);
      const scroll = menu.props.children;
      expect(scroll.type).toBe('ScrollView');
      expect(scroll.props.style.maxHeight).toBe(maxHeight);
      const lastOption = scroll.props.children.at(-1);
      lastOption.props.onPress();
      expect(onChange).toHaveBeenCalledWith('29');
    },
  );
});

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

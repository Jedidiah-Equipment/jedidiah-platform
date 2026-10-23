import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));
vi.mock('@tabler/icons-react-native', () => ({ IconX: 'IconX' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/theme/gluestack-config', () => ({ gluestackConfig: { light: {}, dark: {} } }));
vi.mock('@/theme/use-color-mode', () => ({ useColorMode: () => ({ resolved: 'light' }) }));

import { ModalSheet } from './ModalSheet';
import { useScrollLock } from './scroll-lock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('a field holding the mic stops the sheet scrolling until it lets go', () => {
  let lockScroll!: (locked: boolean) => void;
  function Field() {
    lockScroll = useScrollLock();
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <ModalSheet title="Send feedback" subtitle="About JOB-00007" footer={null} onClose={vi.fn()}>
        <Field />
      </ModalSheet>,
    );
  });
  const sheet = () => renderer.root.findByType('ScrollView' as never);

  act(() => lockScroll(true));
  expect(sheet().props.scrollEnabled).toBe(false);
  act(() => lockScroll(false));
  expect(sheet().props.scrollEnabled).toBe(true);
});

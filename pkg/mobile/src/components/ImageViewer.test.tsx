import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

vi.mock('react-native', () => {
  class Value {
    setValue() {}
    stopAnimation() {}
  }
  return {
    AccessibilityInfo: { announceForAccessibility: vi.fn() },
    ActivityIndicator: 'ActivityIndicator',
    Animated: { Image: 'Animated.Image', Value, View: 'Animated.View' },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    Pressable: 'Pressable',
    View: 'View',
  };
});
vi.mock('@tabler/icons-react-native', () => ({ IconX: 'IconX' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/themed-modal', () => ({
  ThemedModal: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? children : null),
}));

import { ImageViewer, type ViewerPhoto } from './ImageViewer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const photos: ViewerPhoto[] = [
  { key: 'a', label: 'Breakdown photo 1', source: { kind: 'ready', uri: 'file:///a.jpg' } },
  { key: 'b', label: 'Breakdown photo 2', source: { kind: 'loading' } },
  { key: 'c', label: 'Breakdown photo 3', source: { kind: 'ready', uri: 'file:///c.jpg' } },
];

function render(set: ViewerPhoto[], index: number) {
  const onIndexChange = vi.fn();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ImageViewer index={index} photos={set} onClose={vi.fn()} onIndexChange={onIndexChange} />);
  });
  const photo = () => renderer.root.findByProps({ accessibilityRole: 'image' });
  const text = () =>
    renderer.root
      .findAllByType('Text' as never)
      .map((node) => [node.props.children].flat().join(''))
      .join(' ');
  const turnBy = (actionName: string) =>
    act(() => photo().props.onAccessibilityAction({ nativeEvent: { actionName } }));
  return { onIndexChange, photo, text, turnBy };
}

test('the viewer says which photo of the set is on screen and names it', () => {
  const { photo, text } = render(photos, 2);
  expect(text()).toContain('3 of 3');
  expect(photo().props.accessibilityLabel).toBe('Breakdown photo 3');
});

test('a screen reader turns to the next or previous photo, but not past either end', () => {
  const first = render(photos, 0);
  expect(first.photo().props.accessibilityActions.map((action: { name: string }) => action.name)).toEqual(['next']);
  first.turnBy('next');
  expect(first.onIndexChange).toHaveBeenCalledWith(1);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Breakdown photo 2');

  const middle = render(photos, 1);
  middle.turnBy('previous');
  expect(middle.onIndexChange).toHaveBeenCalledWith(0);
});

test('a single photo shows no position and offers no turning', () => {
  const { photo, text } = render(photos.slice(0, 1), 0);
  expect(text()).not.toContain('of');
  expect(photo().props.accessibilityActions).toEqual([]);
});

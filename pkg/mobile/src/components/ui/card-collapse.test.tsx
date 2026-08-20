import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@tabler/icons-react-native', () => ({
  IconChevronDown: 'IconChevronDown',
  IconChevronUp: 'IconChevronUp',
}));
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { CardCollapse } from './card-collapse';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Body() {
  return null;
}

function Badge() {
  return null;
}

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
}

function heading(renderer: ReactTestRenderer) {
  return renderer.root.findByType('Pressable' as never);
}

function press(renderer: ReactTestRenderer): void {
  const onPress = heading(renderer).props.onPress as () => void;
  act(() => {
    onPress();
  });
}

describe('CardCollapse', () => {
  test('hides the body until the heading is pressed, and hides it again', () => {
    const renderer = render(
      <CardCollapse title="ASSEMBLIES · 14">
        <Body />
      </CardCollapse>,
    );

    expect(renderer.root.findAllByType(Body)).toHaveLength(0);
    expect(heading(renderer).props.accessibilityState).toEqual({ expanded: false });

    press(renderer);
    expect(renderer.root.findAllByType(Body)).toHaveLength(1);
    expect(heading(renderer).props.accessibilityState).toEqual({ expanded: true });

    press(renderer);
    expect(renderer.root.findAllByType(Body)).toHaveLength(0);
  });

  test('keeps the counted heading visible while collapsed', () => {
    const renderer = render(
      <CardCollapse title="ASSEMBLIES · 14">
        <Body />
      </CardCollapse>,
    );

    expect(renderer.root.findByType('Text' as never).props.children).toBe('ASSEMBLIES · 14');
  });

  test('keeps a header accessory visible while collapsed', () => {
    const renderer = render(
      <CardCollapse headerAccessory={<Badge />} title="FABRICATION">
        <Body />
      </CardCollapse>,
    );

    expect(renderer.root.findAllByType(Badge)).toHaveLength(1);
    expect(renderer.root.findAllByType(Body)).toHaveLength(0);
  });
});

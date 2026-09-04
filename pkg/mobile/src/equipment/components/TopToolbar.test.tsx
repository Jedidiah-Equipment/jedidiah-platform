import { describe, expect, test, vi } from 'vitest';

vi.mock('@tabler/icons-react-native', () => ({ IconChevronLeft: 'IconChevronLeft' }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@/components/AppLogo', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/equipment/components/assistant/AssistantEntryButton', () => ({
  AssistantEntryButton: 'AssistantEntryButton',
}));
vi.mock('@/components/ProfileMenuButton', () => ({ ProfileMenuButton: 'ProfileMenuButton' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { MAIN_TAB_PARENTS } from '../lib/toolbar-navigation';
import { MainTabToolbar, SecondaryPageToolbar } from './TopToolbar';

type ElementProps = { children?: unknown; className?: string; [key: string]: unknown };
type TestElement = React.ReactElement<ElementProps>;

function asElement(value: unknown): TestElement {
  return value as TestElement;
}

function renderFunctionElement(element: TestElement): TestElement {
  const Component = element.type as (props: ElementProps) => TestElement;
  return Component(element.props);
}

function renderHostElement(element: TestElement): TestElement {
  let rendered = element;

  while (typeof rendered.type === 'function') {
    rendered = renderFunctionElement(rendered);
  }

  return rendered;
}

describe('TopToolbar', () => {
  test('renders the edge-to-edge main-tab contract without a bottom border', () => {
    const toolbar = renderHostElement(
      asElement(
        MainTabToolbar({
          assistantParent: MAIN_TAB_PARENTS.jobs,
          helpTopic: 'jobs',
          subtitle: '8 bays',
          title: 'Schedule',
        }),
      ),
    );
    const children = toolbar.props.children as TestElement[];
    const title = renderFunctionElement(children[1]);
    const titleLines = title.props.children as TestElement[];
    const actions = asElement(children[2]).props.children as TestElement[];

    expect(toolbar.props.className).toContain('w-full');
    expect(toolbar.props.className).not.toContain('border-b');
    expect(asElement(children[0].props.children).props).toMatchObject({ size: 40 });
    expect(titleLines[0].props.children).toBe('Schedule');
    expect(titleLines[1].props).toMatchObject({ children: '8 bays', mono: true, numberOfLines: 1 });
    expect(actions[0].props.parent).toBe(MAIN_TAB_PARENTS.jobs);
    expect(actions[1].props.helpTopic).toBe('jobs');
  });

  test('renders the secondary contract with a named parent and optional content', () => {
    const onBack = vi.fn();
    const avatar = <ViewMarker kind="avatar" />;
    const badge = <ViewMarker kind="badge" />;
    const toolbar = renderHostElement(
      asElement(
        SecondaryPageToolbar({ avatar, badge, onBack, parentLabel: 'Products', subtitle: 'JD-100', title: 'Baler' }),
      ),
    );
    const children = toolbar.props.children as TestElement[];
    const title = renderFunctionElement(children[2]);
    const titleLines = title.props.children as TestElement[];

    expect(toolbar.props.className).toContain('border-b border-border');
    expect(children[0].props).toMatchObject({ accessibilityLabel: 'Back to Products', onPress: onBack });
    expect(children[1].props.className).toContain('h-10 w-10');
    expect(children[1].props.children).toBe(avatar);
    expect(titleLines[1].props).toMatchObject({ children: 'JD-100', mono: true, numberOfLines: 1 });
    expect(children[3].props).toMatchObject({
      children: badge,
      className: expect.stringContaining('h-10'),
      testID: 'secondary-toolbar-badge',
    });
    expect(children[4].type).toBe('ProfileMenuButton');
  });

  test('omits optional secondary avatar and badge without adding alternate actions', () => {
    const toolbar = renderHostElement(
      asElement(
        SecondaryPageToolbar({ onBack: vi.fn(), parentLabel: 'Quotes', subtitle: 'QUOTE DETAIL', title: 'Quote' }),
      ),
    );
    const children = toolbar.props.children as (TestElement | null | undefined)[];

    expect(children[1]).toBeNull();
    expect(children[3]).toBeNull();
    expect(children[4]?.type).toBe('ProfileMenuButton');
  });
});

function ViewMarker({ kind: _kind }: { kind: string }) {
  return null;
}

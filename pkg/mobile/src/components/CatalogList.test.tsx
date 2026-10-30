import { describe, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@/components/Avatar', () => ({ Avatar: 'Avatar' }));
vi.mock('@/components/ui/pulse', () => ({ Pulse: 'Pulse' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { CatalogListCard, CatalogListSkeleton } from './CatalogList';

type ElementProps = { children?: unknown; className?: string; [key: string]: unknown };
type TestElement = React.ReactElement<ElementProps>;

function asElement(value: unknown): TestElement {
  return value as TestElement;
}

/** The card is a bordered frame holding optional leading and action slots around the tappable body, which holds the row. */
function partsOf(card: TestElement) {
  const [leading, body, action] = card.props.children as [TestElement | null, TestElement, TestElement | null];
  return { leading, body, action, children: body.props.children as TestElement[] };
}

describe('CatalogListCard', () => {
  test('owns the full-width avatar, text hierarchy, trailing slot, and accessibility contract', () => {
    const onPress = vi.fn();
    const avatarFallback = <ViewMarker kind="custom-avatar" />;
    const trailing = <ViewMarker kind="price" />;
    const card = asElement(
      CatalogListCard({
        accessibilityHint: 'Opens details',
        accessibilityLabel: 'Catalog item',
        avatarFallback,
        avatarName: 'Item name',
        avatarUri: 'data:image/png;base64,image',
        mainText: 'Main',
        monoText: 'MONO · 1 AUG 2026',
        onPress,
        subText: 'Sub',
        trailing,
      }),
    );
    const { body, children } = partsOf(card);
    const textColumn = asElement(children[1]);
    const textLines = textColumn.props.children as TestElement[];
    const trailingFrame = asElement(children[2]);

    expect(body.props).toMatchObject({
      accessibilityHint: 'Opens details',
      accessibilityLabel: 'Catalog item',
      accessibilityRole: 'button',
      onPress,
    });
    expect(card.props.className).toContain('w-full');
    expect(children[0].props).toMatchObject({
      className: expect.stringContaining('h-11 w-11'),
      fallback: avatarFallback,
      name: 'Item name',
      uri: 'data:image/png;base64,image',
    });
    expect(textLines[0].props).toMatchObject({ children: 'Main', numberOfLines: 1 });
    expect(textLines[1].props).toMatchObject({ children: 'Sub', numberOfLines: 1 });
    expect(textLines[2].props).toMatchObject({ children: 'MONO · 1 AUG 2026', mono: true, numberOfLines: 1 });
    expect(trailingFrame.props.children).toBe(trailing);
  });

  test('omits the optional trailing frame', () => {
    const card = asElement(
      CatalogListCard({
        accessibilityHint: 'Opens details',
        accessibilityLabel: 'Catalog item',
        avatarName: 'Item name',
        mainText: 'Main',
        monoText: 'Mono',
        onPress: vi.fn(),
        subText: 'Sub',
      }),
    );

    expect(partsOf(card).children[2]).toBeNull();
  });

  test('puts leading and action elements beside the tappable body and takes its border colour', () => {
    const leading = <ViewMarker kind="flag" />;
    const action = <ViewMarker kind="book" />;
    const card = asElement(
      CatalogListCard({
        accessibilityHint: 'Opens details',
        action,
        accessibilityLabel: 'Catalog item',
        avatarName: 'Item name',
        borderClassName: 'border-red-500/60',
        leading,
        mainText: 'Main',
        onPress: vi.fn(),
        subText: 'Sub',
      }),
    );
    const parts = partsOf(card);

    expect(parts.leading?.props.children).toBe(leading);
    expect(parts.action?.props.children).toBe(action);
    expect(card.props.className).toContain('border-red-500/60');
    expect(card.props.className).not.toContain('border-border');
    // The body is the controls' sibling, so no button holds another.
    expect(parts.body.props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Catalog item' });
  });

  test('renders structured metadata in place of the plain mono line', () => {
    const metadata = <ViewMarker kind="stock-metadata" />;
    const card = asElement(
      CatalogListCard({
        accessibilityHint: 'Opens details',
        accessibilityLabel: 'Catalog item',
        avatarName: 'Item name',
        mainText: 'Main',
        metadata,
        monoText: 'Fallback metadata',
        onPress: vi.fn(),
        subText: 'Sub',
      }),
    );
    const textColumn = asElement(partsOf(card).children[1]);
    const metadataRow = asElement((textColumn.props.children as TestElement[])[2]);

    expect(metadataRow.props.className).toContain('flex-row items-center');
    expect(metadataRow.props.children).toBe(metadata);
  });

  test('keeps skeleton rows at the same fixed height as loaded cards', () => {
    const card = asElement(
      CatalogListCard({
        accessibilityHint: 'Opens details',
        accessibilityLabel: 'Catalog item',
        avatarName: 'Item name',
        mainText: 'Main',
        monoText: 'Mono',
        onPress: vi.fn(),
        subText: 'Sub',
      }),
    );
    const skeleton = asElement(CatalogListSkeleton({}));
    const firstSkeletonRow = asElement((skeleton.props.children as TestElement[])[0]);

    expect(card.props.className).toContain('h-[76px]');
    expect(firstSkeletonRow.props.className).toContain('h-[76px]');
  });
});

function ViewMarker({ kind: _kind }: { kind: string }) {
  return null;
}

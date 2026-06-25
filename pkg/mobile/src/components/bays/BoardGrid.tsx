import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

// Mirrors the mockup grids `repeat(auto-fill, minmax(<min>px, 1fr))` with a 14px gap.
const GAP = 14;
// The grid fills its container, but a single card never stretches past this — it keeps the
// tile readable when only one column fits a wide-ish viewport.
const MAX_CARD_WIDTH = 420;

/** Columns that fit a measured width at the minimum card width — 1 on phones, more on tablets. */
function columnsForWidth(width: number, minCardWidth: number): number {
  if (width <= 0) return 1;

  return Math.max(1, Math.floor((width + GAP) / (minCardWidth + GAP)));
}

/**
 * Responsive card grid shared by the Bay and Job boards: measures its own width and reflows
 * phone → tablet, capping each cell at {@link MAX_CARD_WIDTH}. Renders nothing until measured so
 * cells never flash at a wrong width.
 */
export function BoardGrid<T>({
  items,
  keyOf,
  minCardWidth = 232,
  renderItem,
}: {
  items: readonly T[];
  keyOf: (item: T) => string;
  minCardWidth?: number;
  renderItem: (item: T) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const columns = columnsForWidth(width, minCardWidth);
  const cellWidth = Math.min((width - GAP * (columns - 1)) / columns, MAX_CARD_WIDTH);

  return (
    <View className="flex-row flex-wrap" onLayout={onLayout} style={{ gap: GAP }}>
      {width > 0
        ? items.map((item) => (
            <View key={keyOf(item)} style={{ width: cellWidth }}>
              {renderItem(item)}
            </View>
          ))
        : null}
    </View>
  );
}

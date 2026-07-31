import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

// Mirrors the mockup grids `repeat(auto-fill, minmax(<min>px, 1fr))` with a 14px gap.
const GAP = 14;
// Cards stop growing past this once the grid has room for more than one column, so a short
// row reads as a grid rather than one stretched tile. A lone column always fills the width.
const MAX_CARD_WIDTH = 420;

// Shared minimum width for every board tile, so toggling Bays ⇄ Jobs keeps the same column layout.
export const BOARD_CARD_MIN_WIDTH = 248;

/** Columns that fit a measured width at the minimum card width — 1 on phones, more on tablets. */
function columnsForWidth(width: number, minCardWidth: number): number {
  if (width <= 0) return 1;

  return Math.max(1, Math.floor((width + GAP) / (minCardWidth + GAP)));
}

/**
 * Responsive card grid shared by the Bay and Job boards: measures its own width and reflows
 * phone → tablet, capping multi-column cells at {@link MAX_CARD_WIDTH}. Renders nothing until measured so
 * cells never flash at a wrong width.
 */
export function BoardGrid<T>({
  items,
  keyOf,
  minCardWidth = BOARD_CARD_MIN_WIDTH,
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
  const cellWidth = columns === 1 ? width : Math.min((width - GAP * (columns - 1)) / columns, MAX_CARD_WIDTH);

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

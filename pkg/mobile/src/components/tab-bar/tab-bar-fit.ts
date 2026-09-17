export const OVERFLOW_TAB_LABEL = 'MORE';

// Tab labels are monospace at 10pt with 0.6 letter spacing, so a label's width is its character
// count times one advance — the bar can size itself without a text-measurement round-trip.
const LABEL_CHARACTER_WIDTH = 6.6;
const SLOT_PADDING = 16;
const MIN_SLOT_WIDTH = 48;

function slotWidth(label: string): number {
  return Math.max(MIN_SLOT_WIDTH, label.length * LABEL_CHARACTER_WIDTH + SLOT_PADDING);
}

export type TabBarFit<T> = { visible: T[]; overflow: T[] };

/**
 * Splits the bar into the leading tabs that keep their whole label at `width` and the trailing
 * ones that move into the overflow menu. Slots share the bar evenly, so the widest visible label
 * decides how many fit, and the menu costs a slot of its own. A `width` of 0 — the frame before
 * layout reports one — keeps every tab rather than guessing.
 */
export function fitAppTabs<T extends { label: string }>(tabs: readonly T[], width: number): TabBarFit<T> {
  const labelsFit = (count: number, slots: number): boolean =>
    tabs.slice(0, count).every((tab) => slotWidth(tab.label) <= width / slots);

  if (width <= 0 || labelsFit(tabs.length, tabs.length)) return { visible: [...tabs], overflow: [] };

  for (let count = tabs.length - 1; count > 1; count--) {
    const slots = count + 1;

    if (labelsFit(count, slots) && slotWidth(OVERFLOW_TAB_LABEL) <= width / slots) {
      return { visible: tabs.slice(0, count), overflow: tabs.slice(count) };
    }
  }

  return { visible: tabs.slice(0, 1), overflow: tabs.slice(1) };
}

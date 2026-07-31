import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import { useIsomorphicLayoutEffect } from '../lib/isomorphic-layout-effect.js';
import { useMessages } from '../messages/index.js';
import { DropdownMenu } from './dropdown-menu.js';

export type FilterChip = {
  key: string;
  label: string;
  active: boolean;
  search: { range?: string; variant?: string };
};

const CHIP_CLASS =
  'flex-none border-[1.5px] px-3.5 py-[9px] font-display text-[15px] font-semibold uppercase tracking-[1px] no-underline transition-colors';
const CHIP_ACTIVE = 'border-ink bg-ink text-white';
const CHIP_IDLE = 'border-[#d6d4ce] bg-white text-ink hover:border-ink';

// Keep the reservation deliberately roomy: dropping one extra chip into the menu is preferable to letting
// the row overflow when the localized "More" label is wider than expected.
const CHIP_GAP = 10;
const MORE_RESERVE = 132;

export function FilterChipRow({ chips }: { chips: FilterChip[] }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<(HTMLElement | null)[]>([]);
  const widthsRef = useRef<number[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(chips.length);
  const [menuOpen, setMenuOpen] = useState(false);

  // Labels and ids both affect sizing; a new Range can otherwise reuse an invalid width cache.
  const signature = chips.map((chip) => `${chip.key}:${chip.label}`).join('|');
  const prevSignature = useRef(signature);
  if (prevSignature.current !== signature) {
    prevSignature.current = signature;
    widthsRef.current = null;
    setVisibleCount(chips.length);
    setMenuOpen(false);
  }

  useIsomorphicLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }

    const measure = () => {
      if (!widthsRef.current) {
        const measured = chipRefs.current.slice(0, chips.length).map((chip) => chip?.offsetWidth ?? 0);
        if (measured.some((width) => width === 0)) {
          return;
        }
        widthsRef.current = measured;
      }
      setVisibleCount(fitCount(widthsRef.current, row.clientWidth));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [chips.length, signature]);

  const visible = chips.slice(0, visibleCount);
  const hidden = chips.slice(visibleCount);
  const hiddenActive = hidden.some((chip) => chip.active);

  return (
    <div ref={rowRef} className="flex min-w-0 flex-1 flex-nowrap items-center gap-2.5">
      {visible.map((chip, index) => (
        <Link
          key={chip.key}
          ref={(node: HTMLAnchorElement | null) => {
            chipRefs.current[index] = node;
          }}
          to="/{-$locale}/products"
          search={chip.search}
          resetScroll={false}
          className={`${CHIP_CLASS} ${chip.active ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {chip.label}
        </Link>
      ))}
      {hidden.length > 0 ? (
        <MoreMenu chips={hidden} active={hiddenActive} open={menuOpen} onOpenChange={setMenuOpen} />
      ) : null}
    </div>
  );
}

function fitCount(widths: number[], containerWidth: number): number {
  if (containerWidth === 0) {
    return widths.length;
  }

  const total = widths.reduce((sum, width) => sum + width, 0) + CHIP_GAP * (widths.length - 1);
  if (total <= containerWidth) {
    return widths.length;
  }

  let used = 0;
  let count = 0;
  for (const [index, width] of widths.entries()) {
    const next = width + (index > 0 ? CHIP_GAP : 0);
    if (used + next + CHIP_GAP + MORE_RESERVE > containerWidth) {
      break;
    }
    used += next;
    count += 1;
  }

  return Math.max(count, 1);
}

function MoreMenu({
  chips,
  active,
  open,
  onOpenChange,
}: {
  chips: FilterChip[];
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const m = useMessages();

  return (
    <DropdownMenu
      open={open}
      onOpenChange={onOpenChange}
      label={m.variantFilter.moreChip(chips.length)}
      triggerClassName={`${CHIP_CLASS} flex items-center gap-1.5 ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
      panelClassName="min-w-[220px] border border-line bg-white p-2 shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
    >
      {chips.map((chip) => (
        <Link
          key={chip.key}
          to="/{-$locale}/products"
          search={chip.search}
          resetScroll={false}
          role="menuitem"
          onClick={() => onOpenChange(false)}
          className={`${CHIP_CLASS} block ${chip.active ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {chip.label}
        </Link>
      ))}
    </DropdownMenu>
  );
}

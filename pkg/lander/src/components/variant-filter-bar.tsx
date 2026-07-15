import { Link } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMessages } from '../messages/index.js';
import type { CatalogGroup, CatalogVariant } from '../server/catalog/products-data.js';
import { DropdownMenu } from './dropdown-menu.js';

type VariantSearch = { range: string; variant?: string };

type VariantChip = {
  key: string;
  label: string;
  active: boolean;
  search: VariantSearch;
};

// Chip sizing matches the Range bar so the two filter rows read as one control (issue #776).
const CHIP_CLASS =
  'border-[1.5px] px-3.5 py-[9px] font-display text-[15px] font-semibold uppercase tracking-[1px] no-underline transition-colors';
const CHIP_ACTIVE = 'border-ink bg-ink text-white';
const CHIP_IDLE = 'border-[#d6d4ce] bg-white text-ink hover:border-ink';

// Row gap (`gap-2.5` = 10px) and a generous reservation for the "MORE +N" toggle, used when deciding how many
// chips fit on one line. The reservation is deliberately roomy: erring large drops one extra chip into the
// menu rather than letting the row overflow its container.
const CHIP_GAP = 10;
const MORE_RESERVE = 132;

// useLayoutEffect measures before paint (no flash of the wrapped layout), but React logs a warning if it runs
// during SSR, where it is a no-op anyway. Fall back to useEffect on the server.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function VariantFilterBar({
  activeGroup,
  activeVariant,
}: {
  activeGroup: CatalogGroup | undefined;
  activeVariant: CatalogVariant | undefined;
}) {
  const m = useMessages();
  const hasVariants = !!activeGroup && activeGroup.variants.length > 0;

  const chips: VariantChip[] = hasVariants
    ? [
        {
          key: '__all__',
          label: m.variantFilter.allChip,
          active: activeVariant === undefined,
          search: { range: activeGroup.slug },
        },
        ...activeGroup.variants.map((variant) => ({
          key: variant.id,
          label: variant.label,
          active: activeVariant?.id === variant.id,
          search: { range: activeGroup.slug, variant: variant.slug },
        })),
      ]
    : [];

  // Selecting a Range with no Variants slides the row shut rather than snapping it away, so keep the last
  // populated chip set mounted while it collapses — there is content to slide out even though the current
  // selection has none.
  const lastChips = useRef<VariantChip[]>(chips);
  if (hasVariants) {
    lastChips.current = chips;
  }
  const displayChips = hasVariants ? chips : lastChips.current;

  // While collapsed or mid-slide the inner wrapper clips to the track height (`overflow-hidden`); once fully
  // open it must let the "More" dropdown overflow downward, so overflow flips to visible after the open
  // transition and back to hidden the moment a collapse starts.
  const [overflowVisible, setOverflowVisible] = useState(hasVariants);
  useEffect(() => {
    if (!hasVariants) {
      setOverflowVisible(false);
    }
  }, [hasVariants]);

  // The grid `0fr <-> 1fr` track animates height without measuring content, so the bordered row slides
  // open/closed. The starting class already matches `hasVariants`, so a first paint with Variants opens
  // instantly instead of animating on load.
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
        hasVariants ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
      onTransitionEnd={(event) => {
        if (event.propertyName === 'grid-template-rows' && hasVariants) {
          setOverflowVisible(true);
        }
      }}
    >
      <div className={overflowVisible ? 'overflow-visible' : 'overflow-hidden'} inert={!hasVariants}>
        <div className="border-t border-line/70">
          <div className="mx-auto flex max-w-[1320px] items-center gap-2.5 px-12 py-3.5 max-nav:px-5 max-nav:py-3">
            <span className="mr-1.5 flex-none font-display text-[13px] font-semibold uppercase tracking-[2px] text-[#999] max-nav:sr-only">
              {m.variantFilter.filterByVariant}
            </span>
            <OverflowChipRow chips={displayChips} />
          </div>
        </div>
      </div>
    </div>
  );
}

function OverflowChipRow({ chips }: { chips: VariantChip[] }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<(HTMLElement | null)[]>([]);
  const widthsRef = useRef<number[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(chips.length);
  const [menuOpen, setMenuOpen] = useState(false);

  // A new Range swaps in a different chip set: drop the cached widths, re-expand so every chip is present to
  // measure, and close any open menu. The signature keys on both id and label so a different range — even one
  // with the same variant count but different label widths — invalidates the cache and re-measures.
  // Adjusting state during render (the React "reset on prop change" pattern) keeps the swap in one paint
  // instead of flashing the old cutoff.
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

    // Chip widths are stable (labels never change once rendered), so measure them once, from the fully
    // expanded paint, then recompute the cutoff on every resize from the cached widths.
    const measure = () => {
      if (!widthsRef.current) {
        const measured = chipRefs.current.slice(0, chips.length).map((chip) => chip?.offsetWidth ?? 0);
        if (measured.some((width) => width === 0)) {
          return; // Not laid out yet; a later resize/paint will measure.
        }
        widthsRef.current = measured;
      }
      setVisibleCount(fitCount(widthsRef.current, row.clientWidth));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [signature]);

  const visible = chips.slice(0, visibleCount);
  const hidden = chips.slice(visibleCount);
  const hiddenActive = hidden.some((chip) => chip.active);

  return (
    <div ref={rowRef} className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
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

// Greedily fit chips into `containerWidth`, reserving room for the "MORE +N" toggle once anything overflows.
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

  return Math.max(count, 1); // Always keep at least the first chip ("All") on the row.
}

function MoreMenu({
  chips,
  active,
  open,
  onOpenChange,
}: {
  chips: VariantChip[];
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

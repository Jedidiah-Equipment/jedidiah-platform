import { useEffect, useRef, useState } from 'react';

import { useMessages } from '../messages/index.js';
import type { CatalogGroup, CatalogVariant } from '../server/catalog/products-data.js';
import { type FilterChip, FilterChipRow } from './filter-chip-row.js';

// A lone Variant chip sits beside "All" and selects the Products the Range already shows, so the row only
// earns its space from two Variants up.
export function hasFilterableVariants(group: CatalogGroup | undefined): group is CatalogGroup {
  return !!group && group.variants.length > 1;
}

export function VariantFilterBar({
  activeGroup,
  activeVariant,
  onHeightTransitionEnd,
}: {
  activeGroup: CatalogGroup | undefined;
  activeVariant: CatalogVariant | undefined;
  onHeightTransitionEnd?: () => void;
}) {
  const m = useMessages();
  const hasVariants = hasFilterableVariants(activeGroup);

  const chips: FilterChip[] = hasVariants
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

  // Selecting a Range with nothing to filter slides the row shut rather than snapping it away, so keep the
  // last populated chip set mounted while it collapses — there is content to slide out even though the
  // current selection has none.
  const lastChips = useRef<FilterChip[]>(chips);
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
        if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') {
          return;
        }
        if (hasVariants) {
          setOverflowVisible(true);
        }
        onHeightTransitionEnd?.();
      }}
    >
      <div className={overflowVisible ? 'overflow-visible' : 'overflow-hidden'} inert={!hasVariants}>
        <div className="border-t border-line/70">
          <div className="mx-auto flex max-w-[1320px] items-center gap-2.5 px-12 py-3.5 max-nav:px-5 max-nav:py-3">
            <span className="mr-1.5 flex-none font-display text-[13px] font-semibold uppercase tracking-[2px] text-[#999] max-nav:sr-only">
              {m.variantFilter.filterByVariant}
            </span>
            <FilterChipRow chips={displayChips} />
          </div>
        </div>
      </div>
    </div>
  );
}

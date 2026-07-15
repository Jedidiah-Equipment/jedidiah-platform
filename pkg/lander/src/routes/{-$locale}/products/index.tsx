import { createFileRoute, Link, useElementScrollRestoration } from '@tanstack/react-router';
import { type RefObject, useCallback, useEffect, useRef } from 'react';

import { PageHero } from '../../../components/page-hero.js';
import { ProductCard } from '../../../components/product-card.js';
import { SandWatermarkSection } from '../../../components/sand-watermark-section.js';
import { VariantFilterBar } from '../../../components/variant-filter-bar.js';
import { type AnalyticsEventProperties, captureEvent } from '../../../lib/analytics.js';
import { seoHead } from '../../../lib/seo.js';
import { messagesForLocale, useMessages } from '../../../messages/index.js';
import { getProductsCatalog } from '../../../server/catalog/products.js';
import type { CatalogGroup, CatalogVariant } from '../../../server/catalog/products-data.js';

type ProductsSearch = { range?: string; variant?: string };
type ProductsCatalogView = {
  activeGroup: CatalogGroup | undefined;
  activeSlug: string | undefined;
  activeVariant: CatalogVariant | undefined;
  visibleGroups: CatalogGroup[];
};

export function catalogFilterChangeProperties(
  previous: ProductsSearch,
  current: ProductsSearch,
): AnalyticsEventProperties<'catalog_filter_changed'> | null {
  if (previous.range === current.range && previous.variant === current.variant) {
    return null;
  }

  return {
    range: current.range ?? null,
    variant: current.variant ?? null,
    previousRange: previous.range ?? null,
    previousVariant: previous.variant ?? null,
  };
}

function useCatalogFilterAnalytics(search: ProductsSearch): void {
  const previousSearch = useRef<ProductsSearch>(search);

  useEffect(() => {
    const properties = catalogFilterChangeProperties(previousSearch.current, search);
    previousSearch.current = search;

    if (properties) {
      captureEvent('catalog_filter_changed', properties);
    }
  }, [search]);
}

export function useProductsFilterScroll(
  target: RefObject<HTMLDivElement | null>,
  search: ProductsSearch,
  hasRestoredScroll = false,
) {
  const previousSearch = useRef({ range: search.range, variant: search.variant });

  const alignTarget = useCallback(() => {
    const element = target.current;
    if (!element) {
      return;
    }

    const scrollOffset = Number.parseFloat(window.getComputedStyle(element).getPropertyValue('--filter-scroll-offset'));
    const top = window.scrollY + element.getBoundingClientRect().top - (Number.isNaN(scrollOffset) ? 0 : scrollOffset);
    window.scrollTo({
      behavior: 'smooth',
      // Bias fractional layout positions upward so pixel rounding cannot tuck the heading under the filters.
      top: Math.floor(top),
    });
  }, [target]);

  useEffect(() => {
    const selectionChanged =
      previousSearch.current.range !== search.range || previousSearch.current.variant !== search.variant;
    previousSearch.current = { range: search.range, variant: search.variant };

    // Preserve a saved grid position on Back, while still aligning direct filtered entries and filter changes.
    if (!selectionChanged && (hasRestoredScroll || (!search.range && !search.variant))) {
      return;
    }

    alignTarget();
  }, [alignTarget, hasRestoredScroll, search.range, search.variant]);

  return alignTarget;
}

export const Route = createFileRoute('/{-$locale}/products/')({
  loader: async ({ context }) => ({ catalog: await getProductsCatalog({ data: { locale: context.locale } }) }),
  head: ({ match }) => {
    const m = messagesForLocale(match.context.locale);

    return seoHead({
      title: m.products.pageTitle,
      description: m.products.metaDescription,
      locale: match.context.locale,
      path: '/products',
    });
  },
  validateSearch: (search: Record<string, unknown>): ProductsSearch => ({
    ...(typeof search.range === 'string' ? { range: search.range } : {}),
    ...(typeof search.variant === 'string' ? { variant: search.variant } : {}),
  }),
  component: ProductsPage,
});

export function resolveProductsCatalogView(groups: CatalogGroup[], search: ProductsSearch): ProductsCatalogView {
  const activeGroup = groups.find((group) => group.slug === search.range);

  if (!activeGroup) {
    return { activeGroup: undefined, activeSlug: undefined, activeVariant: undefined, visibleGroups: groups };
  }

  // Variant slugs are only unique inside their Range, so a bare or stale `variant=` never filters anything.
  const activeVariant = activeGroup.variants.find((variant) => variant.slug === search.variant);
  const filteredProducts = activeVariant
    ? activeGroup.products.filter((product) => product.variantId === activeVariant.id)
    : undefined;
  const visibleGroup = filteredProducts
    ? {
        ...activeGroup,
        count: filteredProducts.length,
        products: filteredProducts,
      }
    : activeGroup;

  return {
    activeGroup,
    activeSlug: activeGroup.slug,
    activeVariant,
    visibleGroups: [visibleGroup],
  };
}

function PageHeader() {
  const m = useMessages();

  return (
    <PageHero eyebrow={m.products.heroEyebrow} title={m.products.heroTitle}>
      <p className="m-0">{m.products.heroBody}</p>
    </PageHero>
  );
}

function FilterChip({ active, label, search }: { active: boolean; label: string; search: ProductsSearch }) {
  return (
    <Link
      to="/{-$locale}/products"
      search={search}
      resetScroll={false}
      className={`border-[1.5px] px-3.5 py-[9px] font-display text-[15px] font-semibold uppercase tracking-[1px] no-underline transition-colors ${
        active ? 'border-ink bg-ink text-white' : 'border-[#d6d4ce] bg-white text-ink hover:border-ink'
      }`}
    >
      {label}
    </Link>
  );
}

function FilterBar({
  activeGroup,
  activeSlug,
  activeVariant,
  groups,
  onHeightTransitionEnd,
  target,
}: {
  activeGroup: CatalogGroup | undefined;
  activeSlug: string | undefined;
  activeVariant: CatalogVariant | undefined;
  groups: CatalogGroup[];
  onHeightTransitionEnd: () => void;
  target: RefObject<HTMLDivElement | null>;
}) {
  const m = useMessages();
  const filterGroup = activeGroup ?? (groups.length === 1 ? groups[0] : undefined);
  const showRangeFilter = groups.length > 1;
  const showVariantFilter = !!filterGroup && filterGroup.variants.length > 0;

  if (!showRangeFilter && !showVariantFilter) {
    return null;
  }

  return (
    <>
      {/* Keep these offsets equal to sticky nav height minus catalog top padding, plus 12px clearance. */}
      <div
        ref={target}
        className="[--filter-scroll-offset:28px] nav:[--filter-scroll-offset:12px] header:[--filter-scroll-offset:24px]"
      />
      <div className="sticky top-[76px] z-30 border-b border-line bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)] max-header:top-16">
        {showRangeFilter ? (
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-2.5 px-12 py-[18px] max-nav:px-5 max-nav:py-3.5">
            <span className="mr-1.5 font-display text-[13px] font-semibold uppercase tracking-[2px] text-[#999] max-nav:sr-only">
              {m.products.filterByRange}
            </span>
            <FilterChip active={activeSlug === undefined} label={m.products.allChip} search={{}} />
            {groups.map((group) => (
              <FilterChip
                key={group.id}
                active={activeSlug === group.slug}
                label={group.label}
                search={{ range: group.slug }}
              />
            ))}
          </div>
        ) : null}
        <VariantFilterBar
          activeGroup={filterGroup}
          activeVariant={activeVariant}
          onHeightTransitionEnd={onHeightTransitionEnd}
        />
      </div>
    </>
  );
}

function ProductGroup({
  group,
  positionOffset,
  range,
  variant,
}: {
  group: CatalogGroup;
  positionOffset: number;
  range: string | null;
  variant: string | null;
}) {
  const m = useMessages();

  return (
    <div className="mb-16 last:mb-0">
      <div className="mb-7 flex flex-wrap items-end gap-x-[18px] gap-y-1.5 border-b-2 border-ink pb-[18px]">
        <h2 className="m-0 font-display text-[40px] font-extrabold uppercase leading-[0.9] tracking-[0.5px] text-ink max-nav:text-[32px]">
          {group.name}
        </h2>
        {group.description ? <span className="pb-1 font-body text-[15px] text-[#777]">{group.description}</span> : null}
        <span className="ml-auto pb-1 font-display text-[14px] font-semibold uppercase tracking-[1px] text-[#999] max-nav:ml-0">
          {m.products.modelCount(group.count)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-6 max-nav:grid-cols-2 max-xs:grid-cols-1">
        {group.products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            onClick={() =>
              captureEvent('product_card_clicked', {
                modelCode: product.modelCode,
                position: positionOffset + index,
                range,
                variant,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function ProductsPage() {
  const { catalog } = Route.useLoaderData();
  const search = Route.useSearch();
  const filterBar = useRef<HTMLDivElement>(null);
  const restoredWindowScroll = useElementScrollRestoration({ getElement: () => window });
  const alignFilterBar = useProductsFilterScroll(filterBar, search, restoredWindowScroll !== undefined);
  useCatalogFilterAnalytics(search);

  const groups = catalog.groups;
  const { activeGroup, activeSlug, activeVariant, visibleGroups } = resolveProductsCatalogView(groups, search);
  let positionOffset = 0;

  return (
    <main className="bg-sand">
      <PageHeader />
      <FilterBar
        activeGroup={activeGroup}
        activeSlug={activeSlug}
        activeVariant={activeVariant}
        groups={groups}
        onHeightTransitionEnd={alignFilterBar}
        target={filterBar}
      />
      <SandWatermarkSection variant="products-catalog" className="pt-16 pb-24 max-nav:pt-12 max-nav:pb-18">
        <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
          {visibleGroups.map((group) => {
            const groupPositionOffset = positionOffset;
            positionOffset += group.products.length;

            return (
              <ProductGroup
                key={group.id}
                group={group}
                positionOffset={groupPositionOffset}
                range={activeSlug ?? null}
                variant={activeVariant?.slug ?? null}
              />
            );
          })}
        </div>
      </SandWatermarkSection>
    </main>
  );
}

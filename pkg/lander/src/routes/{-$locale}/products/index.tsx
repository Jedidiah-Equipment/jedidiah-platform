import { createFileRoute, Link } from '@tanstack/react-router';

import { PageHero } from '../../../components/page-hero.js';
import { ProductCard } from '../../../components/product-card.js';
import { SandWatermarkSection } from '../../../components/sand-watermark-section.js';
import { VariantFilterBar } from '../../../components/variant-filter-bar.js';
import { localePath } from '../../../lib/locale.js';
import { seoHead } from '../../../lib/seo.js';
import { messagesForLocale, useLocale, useMessages } from '../../../messages/index.js';
import { getProductsCatalog } from '../../../server/catalog/products.js';
import type { CatalogGroup, CatalogVariant } from '../../../server/catalog/products-data.js';

type ProductsSearch = { range?: string; variant?: string };
type ProductsCatalogView = {
  activeGroup: CatalogGroup | undefined;
  activeSlug: string | undefined;
  activeVariant: CatalogVariant | undefined;
  visibleGroups: CatalogGroup[];
};

export const Route = createFileRoute('/{-$locale}/products/')({
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
  loader: async () => ({ catalog: await getProductsCatalog() }),
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
  const locale = useLocale();

  return (
    <Link
      to={localePath('/products', locale)}
      search={search}
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
}: {
  activeGroup: CatalogGroup | undefined;
  activeSlug: string | undefined;
  activeVariant: CatalogVariant | undefined;
  groups: CatalogGroup[];
}) {
  const m = useMessages();

  return (
    <div className="sticky top-[76px] z-30 border-b border-line bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)] max-nav:top-16">
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
      <VariantFilterBar activeGroup={activeGroup} activeVariant={activeVariant} />
    </div>
  );
}

function ProductGroup({ group }: { group: CatalogGroup }) {
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
        {group.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

function ProductsPage() {
  const { catalog } = Route.useLoaderData();
  const search = Route.useSearch();

  const groups = catalog.groups;
  const { activeGroup, activeSlug, activeVariant, visibleGroups } = resolveProductsCatalogView(groups, search);

  return (
    <main className="bg-sand">
      <PageHeader />
      <FilterBar activeGroup={activeGroup} activeSlug={activeSlug} activeVariant={activeVariant} groups={groups} />
      <SandWatermarkSection variant="products-catalog" className="pt-16 pb-24 max-nav:pt-12 max-nav:pb-18">
        <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
          {visibleGroups.map((group) => (
            <ProductGroup key={group.id} group={group} />
          ))}
        </div>
      </SandWatermarkSection>
    </main>
  );
}

import { createFileRoute, Link } from '@tanstack/react-router';

import { PageHero } from '../../components/page-hero.js';
import { ProductCard } from '../../components/product-card.js';
import { SandWatermarkSection } from '../../components/sand-watermark-section.js';
import { seoHead } from '../../lib/seo.js';
import { getProductsCatalog } from '../../server/catalog/products.js';
import type { CatalogGroup } from '../../server/catalog/products-data.js';

type ProductsSearch = { range?: string };

export const Route = createFileRoute('/products/')({
  head: () =>
    seoHead({
      title: 'Products — Jedidiah Equipment',
      description:
        'Trailers, tanks, tillage and planting equipment — engineered and built in South Africa for the toughest conditions.',
      path: '/products',
    }),
  validateSearch: (search: Record<string, unknown>): ProductsSearch =>
    typeof search.range === 'string' ? { range: search.range } : {},
  loader: async () => ({ catalog: await getProductsCatalog() }),
  component: ProductsPage,
});

function PageHeader() {
  return (
    <PageHero eyebrow="The full range" title="Our Products">
      <p className="m-0">
        Trailers, tanks, tillage and planting equipment — engineered and built in South Africa for the toughest
        conditions.
      </p>
    </PageHero>
  );
}

function FilterChip({ active, label, search }: { active: boolean; label: string; search: ProductsSearch }) {
  return (
    <Link
      to="/products"
      search={search}
      className={`border-[1.5px] px-3.5 py-[9px] font-display text-[15px] font-semibold uppercase tracking-[1px] no-underline transition-colors ${
        active ? 'border-ink bg-ink text-white' : 'border-[#d6d4ce] bg-white text-ink hover:border-ink'
      }`}
    >
      {label}
    </Link>
  );
}

function FilterBar({ activeSlug, groups }: { activeSlug: string | undefined; groups: CatalogGroup[] }) {
  return (
    <div className="sticky top-[76px] z-30 border-b border-line bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)] max-nav:top-16">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-2.5 px-12 py-[18px] max-nav:px-5 max-nav:py-3.5">
        <span className="mr-1.5 font-display text-[13px] font-semibold uppercase tracking-[2px] text-[#999]">
          Filter by range
        </span>
        <FilterChip active={activeSlug === undefined} label="All Products" search={{}} />
        {groups.map((group) => (
          <FilterChip
            key={group.id}
            active={activeSlug === group.slug}
            label={group.label}
            search={{ range: group.slug }}
          />
        ))}
      </div>
    </div>
  );
}

function ProductGroup({ group }: { group: CatalogGroup }) {
  return (
    <div className="mb-16 last:mb-0">
      <div className="mb-7 flex flex-wrap items-end gap-x-[18px] gap-y-1.5 border-b-2 border-ink pb-[18px]">
        <h2 className="m-0 font-display text-[40px] font-extrabold uppercase leading-[0.9] tracking-[0.5px] text-ink max-nav:text-[32px]">
          {group.name}
        </h2>
        {group.description ? <span className="pb-1 font-body text-[15px] text-[#777]">{group.description}</span> : null}
        <span className="ml-auto pb-1 font-display text-[14px] font-semibold uppercase tracking-[1px] text-[#999] max-nav:ml-0">
          {group.count} {group.count === 1 ? 'model' : 'models'}
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
  const { range } = Route.useSearch();

  const groups = catalog.groups;
  // An unknown or absent slug shows the full catalog rather than an empty page.
  const activeSlug = groups.some((group) => group.slug === range) ? range : undefined;
  const visibleGroups = activeSlug ? groups.filter((group) => group.slug === activeSlug) : groups;

  return (
    <main className="bg-sand">
      <PageHeader />
      <FilterBar activeSlug={activeSlug} groups={groups} />
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

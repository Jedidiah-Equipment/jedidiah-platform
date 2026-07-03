import { createFileRoute, Link } from '@tanstack/react-router';

import { ProductCard } from '../../components/product-card.js';
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
    <section className="relative overflow-hidden bg-ink">
      <img
        src="/hero-silage-harvest.jpg"
        alt=""
        aria-hidden="true"
        className="absolute top-0 right-0 h-full w-[48%] object-cover opacity-35 max-nav:w-full max-nav:opacity-20"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#161616_40%,rgba(22,22,22,0.4)_100%)]" />
      <div className="relative mx-auto max-w-[1320px] px-12 pt-16 pb-14 max-nav:px-5 max-nav:pt-12 max-nav:pb-10">
        <div className="mb-4 flex items-center gap-3.5">
          <span className="h-1 w-[42px] bg-yellow" />
          <span className="font-display text-[15px] font-semibold uppercase tracking-[3px] text-yellow">
            The full range
          </span>
        </div>
        <h1 className="m-0 mb-3.5 font-display text-[68px] font-extrabold uppercase leading-[0.95] tracking-[0.5px] text-white max-nav:text-[46px] max-xs:text-[40px]">
          Our Products
        </h1>
        <p className="m-0 max-w-[560px] font-body text-[19px] leading-[1.55] text-[#bdbdbd]">
          Trailers, tanks, tillage and planting equipment — engineered and built in South Africa for the toughest
          conditions.
        </p>
      </div>
    </section>
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
      <section className="mx-auto max-w-[1320px] px-12 pt-16 pb-24 max-nav:px-5 max-nav:pt-12 max-nav:pb-18">
        {visibleGroups.map((group) => (
          <ProductGroup key={group.id} group={group} />
        ))}
      </section>
    </main>
  );
}

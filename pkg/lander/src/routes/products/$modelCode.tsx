import {
  IconArrowRight,
  IconDownload,
  IconSquareCheckFilled,
  IconSquarePlus,
  IconStarFilled,
} from '@tabler/icons-react';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { ProductCard } from '../../components/product-card.js';
import { captureEvent } from '../../lib/analytics.js';
import { seoHead, truncateDescription } from '../../lib/seo.js';
import { getProductDetail } from '../../server/catalog/product-detail.js';
import type { ProductDetail, ProductHighlight } from '../../server/catalog/product-detail-data.js';

export const Route = createFileRoute('/products/$modelCode')({
  loader: async ({ params }) => {
    const detail = await getProductDetail({ data: params.modelCode });
    if (!detail) {
      throw notFound();
    }

    return { detail };
  },
  head: ({ loaderData, params }) => {
    const detail = loaderData?.detail;
    if (!detail) {
      // The loader throws notFound() for unknown model codes, so there's no detail to describe. Emit a
      // sensible head pointing back at the catalog rather than leaking a half-built title.
      return seoHead({
        title: 'Product not found — Jedidiah Equipment',
        description: 'Browse the full Jedidiah Equipment range to find the right machine for your operation.',
        path: `/products/${encodeURIComponent(params.modelCode)}`,
      });
    }

    const description = truncateDescription(
      detail.description || `${detail.name} from the ${detail.rangeName} by Jedidiah Equipment.`,
    );

    return seoHead({
      title: `${detail.name} — ${detail.rangeName} | Jedidiah Equipment`,
      description,
      path: `/products/${encodeURIComponent(detail.modelCode)}`,
      image: detail.imageUrl,
    });
  },
  notFoundComponent: ProductNotFound,
  component: ProductDetailPage,
});

function Breadcrumb({ rangeName, name }: { rangeName: string; name: string }) {
  return (
    <div className="bg-ink border-b border-[#2a2a2a]">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-2.5 px-12 py-4 font-body text-[14px] text-[#8a8a8a] max-nav:px-5 max-nav:py-3.5">
        <Link to="/" className="text-[#8a8a8a] no-underline hover:text-white">
          Home
        </Link>
        <span>/</span>
        <Link to="/products" className="text-[#8a8a8a] no-underline hover:text-white">
          Products
        </Link>
        <span>/</span>
        <span className="text-yellow">{rangeName}</span>
        <span>/</span>
        <span className="text-white">{name}</span>
      </div>
    </div>
  );
}

function Gallery({ images, name }: { images: ProductDetail['galleryImages']; name: string }) {
  const [active, setActive] = useState(0);
  const activeImage = images[active] ?? images[0];

  return (
    <div>
      <div className="aspect-[16/11] overflow-hidden border border-line bg-[#dcdcd6]">
        <img src={activeImage.imageUrl} alt={name} className="h-full w-full object-cover" />
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-3.5">
        {images.map((image, index) => (
          <button
            key={image.slot}
            type="button"
            onClick={() => setActive(index)}
            aria-label={`View image ${index + 1}`}
            className={`aspect-[16/11] overflow-hidden bg-[#dcdcd6] p-0 ${
              index === active ? 'border-2 border-gold' : 'border-2 border-line'
            }`}
          >
            <img src={image.imageUrl} alt="" aria-hidden="true" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function HighlightTiles({ highlights }: { highlights: ProductHighlight[] }) {
  return (
    <div className="mb-[30px] grid grid-cols-3 gap-px border border-line bg-line">
      {highlights.map((highlight) => (
        <div key={highlight.label} className="bg-[#faf9f6] px-4 py-[18px]">
          <div className="font-display text-[28px] font-extrabold leading-none text-ink">{highlight.value}</div>
          <div className="mt-1.5 font-display text-[12px] font-semibold uppercase tracking-[1.5px] text-[#999]">
            {highlight.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function Hero({ detail }: { detail: ProductDetail }) {
  return (
    <section className="border-b border-line bg-white">
      <div className="mx-auto grid max-w-[1320px] grid-cols-[1.05fr_1fr] gap-14 px-12 pt-12 pb-14 max-nav:grid-cols-1 max-nav:gap-8 max-nav:px-5 max-nav:pt-8 max-nav:pb-10">
        <Gallery images={detail.galleryImages} name={detail.name} />

        <div className="flex flex-col">
          <span className="self-start bg-gold px-3.5 py-1.5 font-display text-[13px] font-bold uppercase tracking-[2px] text-ink">
            {detail.rangeName}
          </span>
          <h1 className="mt-[18px] mb-4 font-display text-[56px] font-extrabold uppercase leading-[0.94] tracking-[0.5px] text-ink max-nav:text-[40px]">
            {detail.name}
          </h1>
          {detail.tagline ? (
            <p className="m-0 mb-7 font-body text-[19px] leading-[1.6] text-[#555]">{detail.tagline}</p>
          ) : null}

          <HighlightTiles highlights={detail.highlights} />

          {detail.description ? (
            <p className="m-0 mb-8 font-body text-[16px] leading-[1.7] text-[#555]">{detail.description}</p>
          ) : null}

          <div className="mt-auto flex flex-wrap gap-3.5">
            <Link
              to="/contact"
              className="flex items-center gap-3 bg-gold px-[30px] py-[17px] font-display text-[18px] font-bold uppercase tracking-[1.5px] text-ink no-underline transition-colors hover:bg-yellow"
            >
              Contact Us
              <IconArrowRight className="text-ink" size={20} stroke={2.4} aria-hidden="true" />
            </Link>
            <a
              href="tel:+27128190131"
              className="flex items-center border-2 border-ink bg-transparent px-[30px] py-[17px] font-display text-[18px] font-bold uppercase tracking-[1.5px] text-ink no-underline transition-colors hover:bg-ink hover:text-white"
            >
              Call Us
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ children, className }: { children: string; className?: string }) {
  return (
    <h2
      className={`m-0 mb-6 border-b-2 border-ink pb-3.5 font-display text-[34px] font-extrabold uppercase tracking-[0.5px] text-ink ${
        className ?? ''
      }`}
    >
      {children}
    </h2>
  );
}

function StandardIcon() {
  return <IconSquareCheckFilled className="mt-px flex-none text-gold" size={22} aria-hidden="true" />;
}

function OptionalIcon() {
  return <IconSquarePlus className="mt-px flex-none text-ink" size={22} aria-hidden="true" />;
}

function FeatureIcon() {
  return <IconStarFilled className="mt-px flex-none text-gold" size={24} aria-hidden="true" />;
}

function ItemList({ items, icon }: { items: string[]; icon: () => React.JSX.Element }) {
  return (
    <div className="flex flex-col gap-3.5">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-3.5">
          {icon()}
          <span className="font-body text-[16px] leading-[1.5] text-[#333]">{item}</span>
        </div>
      ))}
    </div>
  );
}

function DownloadIcon() {
  return <IconDownload className="flex-none text-gold" size={22} stroke={1.8} aria-hidden="true" />;
}

function Downloads({ brochureHref, modelCode }: { brochureHref: string; modelCode: string }) {
  return (
    <div className="mt-10">
      <h3 className="m-0 mb-4 font-display text-[20px] font-bold uppercase tracking-[1px] text-ink">Downloads</h3>
      <div className="flex flex-col gap-3">
        <a
          href={brochureHref}
          onClick={() => captureEvent('brochure_downloaded', { modelCode })}
          className="flex items-center gap-3.5 border border-[#e2e0da] bg-white px-[18px] py-3.5 no-underline transition-colors hover:border-ink"
        >
          <DownloadIcon />
          <span className="flex-1 font-body text-[15px] font-semibold text-ink">Product Brochure (PDF)</span>
        </a>
      </div>
    </div>
  );
}

function AssembliesAndFeatures({ detail }: { detail: ProductDetail }) {
  const { standardAssemblies, optionalAssemblies, keyFeatures } = detail;

  return (
    <section className="mx-auto grid max-w-[1320px] grid-cols-[1.15fr_1fr] items-start gap-16 px-12 py-[72px] max-nav:grid-cols-1 max-nav:gap-11 max-nav:px-5 max-nav:py-12">
      <div>
        {standardAssemblies.length > 0 ? (
          <>
            <SectionHeading>Standard Assemblies</SectionHeading>
            <ItemList items={standardAssemblies} icon={StandardIcon} />
          </>
        ) : null}
        {optionalAssemblies.length > 0 ? (
          <>
            <SectionHeading className={standardAssemblies.length > 0 ? 'mt-11' : ''}>
              Optional Assemblies
            </SectionHeading>
            <ItemList items={optionalAssemblies} icon={OptionalIcon} />
          </>
        ) : null}
      </div>

      {keyFeatures.length > 0 || detail.brochureHref ? (
        <div>
          {keyFeatures.length > 0 ? (
            <>
              <SectionHeading>Key Features</SectionHeading>
              <div className="flex flex-col gap-4">
                {keyFeatures.map((feature) => (
                  <div key={feature} className="flex items-start gap-3.5">
                    <FeatureIcon />
                    <span className="font-body text-[16px] leading-[1.5] text-[#444]">{feature}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {detail.brochureHref ? <Downloads brochureHref={detail.brochureHref} modelCode={detail.modelCode} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function Related({ rangeName, related }: { rangeName: string; related: ProductDetail['related'] }) {
  if (related.length === 0) {
    return null;
  }

  return (
    <section className="bg-[#ececea] py-[72px] max-nav:py-14">
      <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
        <h2 className="m-0 mb-8 font-display text-[40px] font-extrabold uppercase tracking-[0.5px] text-ink">
          More in {rangeName}
        </h2>
        <div className="grid grid-cols-3 gap-6 max-nav:grid-cols-2 max-xs:grid-cols-1">
          {related.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductDetailPage() {
  const { detail } = Route.useLoaderData();

  useEffect(() => {
    captureEvent('product_viewed', { modelCode: detail.modelCode, range: detail.rangeName });
  }, [detail.modelCode, detail.rangeName]);

  return (
    <main className="bg-sand">
      <Breadcrumb rangeName={detail.rangeName} name={detail.name} />
      <Hero detail={detail} />
      <AssembliesAndFeatures detail={detail} />
      <Related rangeName={detail.rangeName} related={detail.related} />
    </main>
  );
}

function ProductNotFound() {
  return (
    <main className="bg-sand">
      <section className="mx-auto max-w-[1320px] px-12 py-32 text-center max-nav:px-5 max-nav:py-20">
        <span className="font-display text-[15px] font-semibold uppercase tracking-[3px] text-[#8a7a2a]">
          Not found
        </span>
        <h1 className="mt-3.5 mb-4 font-display text-[56px] font-extrabold uppercase leading-[0.94] tracking-[0.5px] text-ink max-nav:text-[40px]">
          Product not found
        </h1>
        <p className="m-0 mb-8 font-body text-[19px] leading-[1.6] text-[#555]">
          We couldn't find that model. Browse the full range to find what you need.
        </p>
        <Link
          to="/products"
          className="inline-flex items-center gap-3 bg-ink px-[30px] py-[17px] font-display text-[18px] font-bold uppercase tracking-[1.5px] text-white no-underline transition-colors hover:bg-black"
        >
          View All Products
        </Link>
      </section>
    </main>
  );
}

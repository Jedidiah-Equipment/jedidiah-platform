import { contactNumberE164 } from '@pkg/domain';
import {
  IconArrowRight,
  IconCheck,
  IconDownload,
  IconShare,
  IconSquareCheckFilled,
  IconSquarePlus,
  IconStarFilled,
  IconX,
} from '@tabler/icons-react';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { ProductCard } from '../../../components/product-card.js';
import { SandWatermarkSection } from '../../../components/sand-watermark-section.js';
import { captureEvent, captureEventForNavigation } from '../../../lib/analytics.js';
import { seoHead, truncateDescription } from '../../../lib/seo.js';
import { messagesForLocale, useMessages } from '../../../messages/index.js';
import { getProductDetail } from '../../../server/catalog/product-detail.js';
import type { ProductDetail, ProductHighlight } from '../../../server/catalog/product-detail-data.js';

export const Route = createFileRoute('/{-$locale}/products/$modelCode')({
  loader: async ({ context, params }) => {
    const detail = await getProductDetail({ data: { locale: context.locale, modelCode: params.modelCode } });
    if (!detail) {
      throw notFound();
    }

    return { detail };
  },
  head: ({ loaderData, match, params }) => {
    const m = messagesForLocale(match.context.locale);
    const detail = loaderData?.detail;
    if (!detail) {
      // The loader throws notFound() for unknown model codes, so there's no detail to describe. Emit a
      // sensible head pointing back at the catalog rather than leaking a half-built title.
      return seoHead({
        title: m.productDetail.notFoundPageTitle,
        description: m.productDetail.notFoundMetaDescription,
        locale: match.context.locale,
        path: `/products/${encodeURIComponent(params.modelCode)}`,
      });
    }

    const description = truncateDescription(
      detail.description || m.productDetail.fallbackDescription(detail.name, detail.rangeName),
    );

    return seoHead({
      title: m.productDetail.pageTitle(detail.name, detail.rangeName),
      description,
      locale: match.context.locale,
      path: `/products/${encodeURIComponent(detail.modelCode)}`,
      image: detail.ogImageUrl,
    });
  },
  notFoundComponent: ProductNotFound,
  component: ProductDetailPage,
});

function Breadcrumb({ rangeName, name }: { rangeName: string; name: string }) {
  const m = useMessages();

  return (
    <div className="bg-ink border-b border-[#2a2a2a]">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-2.5 px-12 py-4 font-body text-[14px] text-[#8a8a8a] max-nav:px-5 max-nav:py-3.5">
        <Link to="/{-$locale}" className="text-[#8a8a8a] no-underline hover:text-white">
          {m.productDetail.breadcrumbHome}
        </Link>
        <span>/</span>
        <Link to="/{-$locale}/products" className="text-[#8a8a8a] no-underline hover:text-white">
          {m.productDetail.breadcrumbProducts}
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
  const m = useMessages();
  const [active, setActive] = useState(0);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const activeImage = images[active] ?? images[0];

  useEffect(() => {
    if (!isImageDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsImageDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImageDialogOpen]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsImageDialogOpen(true)}
        aria-label={m.productDetail.openFullSizeImage(name)}
        className="group block aspect-[16/11] w-full cursor-pointer overflow-hidden border border-line bg-[#dcdcd6] p-0 transition-[translate,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-gold hover:shadow-[0_18px_36px_rgba(0,0,0,0.18)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        <img
          src={activeImage.imageUrl}
          alt={name}
          className="h-full w-full object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-[1.035]"
        />
      </button>
      <div className="mt-3.5 grid grid-cols-3 gap-3.5">
        {images.map((image, index) => (
          <button
            key={image.slot}
            type="button"
            onClick={() => setActive(index)}
            aria-label={m.productDetail.viewImage(index + 1)}
            className="group aspect-[16/11] cursor-pointer bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-gold"
          >
            <div
              className={`h-full w-full overflow-hidden bg-[#dcdcd6] transition-[translate,border-color,box-shadow] duration-[1500ms] ease-out ${
                index === active
                  ? 'border-2 border-gold shadow-[0_10px_22px_rgba(0,0,0,0.16)]'
                  : 'border-2 border-line group-hover:-translate-y-0.5 group-hover:border-gold/80 group-hover:shadow-[0_10px_22px_rgba(0,0,0,0.12)]'
              }`}
            >
              <img
                src={image.imageUrl}
                alt=""
                aria-hidden="true"
                className={`h-full w-full object-cover transition-transform duration-[1500ms] ease-out ${
                  index === active ? 'scale-[1.04]' : 'group-hover:scale-[1.04]'
                }`}
              />
            </div>
          </button>
        ))}
      </div>
      {isImageDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={m.productDetail.fullSizeImage(name)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-5 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsImageDialogOpen(false);
            }
          }}
        >
          <div className="relative flex max-h-[92vh] w-full max-w-[1200px] items-center justify-center">
            <button
              type="button"
              aria-label={m.productDetail.closeImageDialog}
              onClick={() => setIsImageDialogOpen(false)}
              className="absolute top-0 right-0 z-10 flex size-11 -translate-y-3 translate-x-3 cursor-pointer items-center justify-center bg-gold text-ink transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              <IconX size={24} stroke={2.4} aria-hidden="true" />
            </button>
            <img
              src={activeImage.imageUrl}
              alt={name}
              className="max-h-[88vh] max-w-full object-contain shadow-[0_24px_70px_rgba(0,0,0,0.42)]"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Lander readiness only requires one technical detail and the schema caps the list at three, so the tile
// grid tracks the actual count rather than a fixed three — otherwise one or two details leave empty columns.
// The column classes are spelled out as literals so Tailwind keeps them in the build.
const TILE_GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};

function HighlightTiles({ highlights }: { highlights: ProductHighlight[] }) {
  return (
    <div
      className={`mb-[30px] grid ${TILE_GRID_COLS[highlights.length] ?? 'grid-cols-3'} gap-px border border-line bg-line`}
    >
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

type ShareStatus = 'idle' | 'copied' | 'failed';

export function ProductShareButton({ modelCode, name }: { modelCode: string; name: string }) {
  const m = useMessages();
  const [status, setStatus] = useState<ShareStatus>('idle');

  useEffect(() => {
    if (status === 'idle') {
      return;
    }

    const timeout = window.setTimeout(() => setStatus('idle'), 2500);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const handleShare = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: m.productDetail.shareTitle(name),
          text: m.productDetail.shareText(name),
          url,
        });
        captureEvent('product_shared', { modelCode, method: 'native' });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      captureEvent('product_shared', { modelCode, method: 'clipboard' });
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  const label =
    status === 'copied'
      ? m.productDetail.linkCopied
      : status === 'failed'
        ? m.productDetail.shareFailed
        : m.productDetail.shareProduct;

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      aria-live="polite"
      className="flex cursor-pointer items-center gap-2.5 border-2 border-[#cfcac0] bg-transparent px-[24px] py-[17px] font-display text-[18px] font-bold uppercase tracking-[1.5px] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-gold max-xs:col-span-2 max-xs:justify-center"
    >
      {status === 'copied' ? (
        <IconCheck size={20} stroke={2.4} aria-hidden="true" />
      ) : (
        <IconShare size={20} stroke={2.2} aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

function Hero({ detail }: { detail: ProductDetail }) {
  const m = useMessages();

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

          {detail.highlights.length > 0 ? <HighlightTiles highlights={detail.highlights} /> : null}

          {detail.description ? (
            <p className="m-0 mb-8 font-body text-[16px] leading-[1.7] text-[#555]">{detail.description}</p>
          ) : null}

          <div className="mt-auto flex flex-wrap gap-3.5 max-xs:grid max-xs:grid-cols-2">
            <Link
              to="/{-$locale}/contact"
              className="flex items-center gap-3 bg-gold px-[30px] py-[17px] font-display text-[18px] font-bold uppercase tracking-[1.5px] text-ink no-underline transition-colors hover:bg-yellow max-xs:justify-center max-xs:px-[18px]"
            >
              {m.productDetail.contactUs}
              <IconArrowRight className="text-ink" size={20} stroke={2.4} aria-hidden="true" />
            </Link>
            <a
              href={`tel:${contactNumberE164()}`}
              onClick={() => captureEventForNavigation('phone_link_clicked', { placement: 'product_detail' })}
              className="flex items-center border-2 border-ink bg-transparent px-[30px] py-[17px] font-display text-[18px] font-bold uppercase tracking-[1.5px] text-ink no-underline transition-colors hover:bg-ink hover:text-white max-xs:justify-center max-xs:px-[18px]"
            >
              {m.productDetail.callUs}
            </a>
            <ProductShareButton modelCode={detail.modelCode} name={detail.name} />
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

export function Downloads({ brochureHref, modelCode }: { brochureHref: string; modelCode: string }) {
  const m = useMessages();

  return (
    <div>
      <SectionHeading>{m.productDetail.downloads}</SectionHeading>
      <div className="flex flex-col gap-3">
        <a
          href={brochureHref}
          target="_blank"
          rel="noreferrer"
          onClick={() => captureEvent('brochure_downloaded', { modelCode })}
          className="flex items-center gap-3.5 border border-[#e2e0da] bg-white px-[18px] py-3.5 no-underline transition-colors hover:border-ink"
        >
          <DownloadIcon />
          <span className="flex-1 font-body text-[15px] font-semibold text-ink">{m.productDetail.productBrochure}</span>
        </a>
      </div>
    </div>
  );
}

export function AssembliesAndFeatures({ detail }: { detail: ProductDetail }) {
  const m = useMessages();
  const { standardAssemblies, optionalAssemblies, keyFeatures } = detail;
  const hasTopRow = keyFeatures.length > 0 || Boolean(detail.brochureHref);
  const hasAssemblyRow = standardAssemblies.length > 0 || optionalAssemblies.length > 0;

  return (
    <SandWatermarkSection variant="product-detail" className="py-[72px] max-nav:py-12">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-16 px-12 max-nav:gap-11 max-nav:px-5">
        {hasTopRow ? (
          <div className="grid grid-cols-[1.15fr_1fr] items-start gap-16 max-nav:grid-cols-1 max-nav:gap-11">
            {keyFeatures.length > 0 ? (
              <div>
                <SectionHeading>{m.productDetail.keyFeatures}</SectionHeading>
                <div className="flex flex-col gap-4">
                  {keyFeatures.map((feature) => (
                    <div key={feature} className="flex items-start gap-3.5">
                      <FeatureIcon />
                      <span className="font-body text-[16px] leading-[1.5] text-[#444]">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {detail.brochureHref ? <Downloads brochureHref={detail.brochureHref} modelCode={detail.modelCode} /> : null}
          </div>
        ) : null}

        {hasAssemblyRow ? (
          <div className="grid grid-cols-[1.15fr_1fr] items-start gap-16 max-nav:grid-cols-1 max-nav:gap-11">
            {standardAssemblies.length > 0 ? (
              <div>
                <SectionHeading>{m.productDetail.standardAssemblies}</SectionHeading>
                <ItemList items={standardAssemblies} icon={StandardIcon} />
              </div>
            ) : null}
            {optionalAssemblies.length > 0 ? (
              <div>
                <SectionHeading>{m.productDetail.optionalAssemblies}</SectionHeading>
                <ItemList items={optionalAssemblies} icon={OptionalIcon} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </SandWatermarkSection>
  );
}

function Related({ rangeName, related }: { rangeName: string; related: ProductDetail['related'] }) {
  const m = useMessages();

  if (related.length === 0) {
    return null;
  }

  return (
    <section className="bg-[#ececea] py-[72px] max-nav:py-14">
      <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
        <h2 className="m-0 mb-8 font-display text-[40px] font-extrabold uppercase tracking-[0.5px] text-ink">
          {m.productDetail.relatedHeading(rangeName)}
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
    captureEvent('product_viewed', {
      modelCode: detail.modelCode,
      range: detail.rangeName,
      variant: detail.variant,
    });
  }, [detail.modelCode, detail.rangeName, detail.variant]);

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
  const m = useMessages();

  return (
    <main className="bg-sand">
      <SandWatermarkSection variant="product-not-found" className="py-32 text-center max-nav:py-20">
        <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
          <span className="font-display text-[15px] font-semibold uppercase tracking-[3px] text-[#8a7a2a]">
            {m.productDetail.notFoundEyebrow}
          </span>
          <h1 className="mt-3.5 mb-4 font-display text-[56px] font-extrabold uppercase leading-[0.94] tracking-[0.5px] text-ink max-nav:text-[40px]">
            {m.productDetail.notFoundTitle}
          </h1>
          <p className="m-0 mb-8 font-body text-[19px] leading-[1.6] text-[#555]">{m.productDetail.notFoundBody}</p>
          <Link
            to="/{-$locale}/products"
            className="inline-flex items-center gap-3 bg-ink px-[30px] py-[17px] font-display text-[18px] font-bold uppercase tracking-[1.5px] text-white no-underline transition-colors hover:bg-black"
          >
            {m.productDetail.viewAllProducts}
          </Link>
        </div>
      </SandWatermarkSection>
    </main>
  );
}

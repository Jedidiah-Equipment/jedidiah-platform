import { IconArrowRight } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';

import { FeatureBar } from '../../components/feature-bar.js';
import { RangeCard } from '../../components/range-card.js';
import { SandWatermarkSection } from '../../components/sand-watermark-section.js';
import { captureEvent } from '../../lib/analytics.js';
import { seoHead } from '../../lib/seo.js';
import { messagesForLocale, useMessages } from '../../messages/index.js';
import { getHomeRanges } from '../../server/catalog/ranges.js';

export const Route = createFileRoute('/{-$locale}/')({
  // Loader precedes head: TypeScript infers the route's loader data poorly when a context-sensitive head
  // callback comes first.
  loader: async ({ context }) => ({ ranges: await getHomeRanges({ data: { locale: context.locale } }) }),
  head: ({ match }) => {
    const m = messagesForLocale(match.context.locale);

    return seoHead({ title: m.site.title, description: m.site.description, locale: match.context.locale, path: '/' });
  },
  component: HomePage,
});

function ArrowIcon({ className }: { className: string }) {
  return <IconArrowRight className={className} size={20} stroke={2.4} aria-hidden="true" />;
}

function Hero() {
  const m = useMessages();

  return (
    <section className="relative overflow-hidden bg-ink">
      <div className="absolute inset-0">
        <img
          src="/hero-silage-harvest.jpg"
          alt={m.home.heroImageAlt}
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,15,15,0.94)_0%,rgba(15,15,15,0.82)_32%,rgba(15,15,15,0.35)_60%,rgba(15,15,15,0.15)_100%)]" />
      <div className="relative mx-auto max-w-[1320px] px-12 pt-24 max-nav:px-5 max-nav:pt-12">
        <div className="max-w-[660px]">
          <div className="mb-6 flex items-center gap-3.5">
            <span className="h-1 w-[42px] bg-yellow" />
            <span className="font-display text-[16px] font-semibold uppercase tracking-[3px] text-yellow">
              {m.home.heroEyebrow}
            </span>
          </div>
          <h1 className="m-0 mb-[26px] font-display text-[88px] font-extrabold uppercase leading-[0.92] tracking-[0.5px] text-white max-nav:text-[46px] max-xs:text-[40px]">
            {m.home.heroTitle}
          </h1>
          <p className="m-0 mb-10 max-w-[480px] font-body text-[21px] leading-[1.55] text-[#cfcfcf] max-nav:mb-[30px] max-nav:text-[17px]">
            {m.home.heroSubtitle}
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/{-$locale}/contact"
              onClick={() => captureEvent('cta_clicked', { cta: 'hero_contact', placement: 'hero' })}
              className="flex items-center gap-3.5 bg-yellow px-8 py-[18px] font-display text-[19px] font-bold uppercase tracking-[1.5px] text-ink no-underline transition-colors hover:bg-gold"
            >
              {m.home.contactUs} <ArrowIcon className="text-ink" />
            </Link>
            <Link
              to="/{-$locale}/products"
              onClick={() => captureEvent('cta_clicked', { cta: 'hero_products', placement: 'hero' })}
              className="flex items-center border-2 border-white/[0.55] bg-transparent px-8 py-[18px] font-display text-[19px] font-bold uppercase tracking-[1.5px] text-white no-underline transition-colors hover:border-yellow hover:text-yellow"
            >
              {m.home.viewEquipmentRange}
            </Link>
          </div>
        </div>
        <div className="mt-[88px] max-nav:mt-12">
          <FeatureBar />
        </div>
      </div>
    </section>
  );
}

function EquipmentRanges({ ranges }: { ranges: Awaited<ReturnType<typeof getHomeRanges>> }) {
  const m = useMessages();

  return (
    <SandWatermarkSection variant="home-ranges" className="py-24 pb-26 max-nav:py-14">
      <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-3.5 flex items-center gap-3.5">
              <span className="h-1 w-[42px] bg-yellow" />
              <span className="font-display text-[15px] font-semibold uppercase tracking-[3px] text-[#8a7a2a]">
                {m.home.rangesEyebrow}
              </span>
            </div>
            <h2 className="m-0 font-display text-[60px] font-extrabold uppercase leading-[0.95] tracking-[0.5px] text-ink max-nav:text-[38px]">
              {m.home.rangesTitle}
            </h2>
          </div>
          <Link
            to="/{-$locale}/products"
            className="flex items-center gap-3.5 bg-ink px-[26px] py-[15px] font-display text-[16px] font-bold uppercase tracking-[1.5px] text-white no-underline transition-colors hover:bg-black"
          >
            {m.home.viewAllProducts} <ArrowIcon className="text-yellow" />
          </Link>
        </div>

        {ranges.length > 0 ? (
          <div className="grid grid-cols-4 gap-6 max-nav:grid-cols-2 max-xs:grid-cols-1">
            {ranges.map((range, position) => (
              <RangeCard key={range.id} range={range} position={position} />
            ))}
          </div>
        ) : null}
      </div>
    </SandWatermarkSection>
  );
}

function CtaBand() {
  const m = useMessages();

  return (
    <section className="relative overflow-hidden bg-ink">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-10 px-12 py-[72px] max-nav:flex-col max-nav:items-start max-nav:gap-6 max-nav:px-5 max-nav:py-14">
        <div>
          <h2 className="m-0 mb-3 font-display text-[50px] font-extrabold uppercase leading-[0.98] tracking-[0.5px] text-white max-nav:text-[34px]">
            {m.home.ctaTitle}
          </h2>
          <p className="m-0 max-w-[560px] font-body text-[19px] text-[#bdbdbd]">{m.home.ctaBody}</p>
        </div>
        <Link
          to="/{-$locale}/contact"
          onClick={() => captureEvent('cta_clicked', { cta: 'bottom_band_contact', placement: 'bottom_band' })}
          className="flex flex-none items-center gap-3.5 bg-yellow px-[38px] py-5 font-display text-[20px] font-bold uppercase tracking-[1.5px] text-ink no-underline transition-colors hover:bg-gold"
        >
          {m.home.contactUs} <ArrowIcon className="text-ink" />
        </Link>
      </div>
    </section>
  );
}

function HomePage() {
  const { ranges } = Route.useLoaderData();

  return (
    <main className="bg-sand">
      <Hero />
      <EquipmentRanges ranges={ranges} />
      <CtaBand />
    </main>
  );
}

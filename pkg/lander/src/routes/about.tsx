import { IconArrowRight } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';

import { PageHero } from '../components/page-hero.js';
import { SandWatermarkSection } from '../components/sand-watermark-section.js';
import { seoHead } from '../lib/seo.js';
import { en } from '../messages/en.js';
import { useMessages } from '../messages/index.js';
import { getProductRangeCount } from '../server/catalog/ranges.js';

export const Route = createFileRoute('/about')({
  head: () =>
    seoHead({
      title: en.about.pageTitle,
      description: en.about.metaDescription,
      path: '/about',
    }),
  loader: async () => ({ productRangeCount: await getProductRangeCount() }),
  component: AboutPage,
});

function ArrowIcon() {
  return <IconArrowRight className="text-ink" size={20} stroke={2.4} aria-hidden="true" />;
}

function Eyebrow({ label, color }: { label: string; color: string }) {
  return (
    <div className="mb-4 flex items-center gap-3.5">
      <span className="h-1 w-[42px] bg-yellow" />
      <span className={`font-display text-[15px] font-semibold uppercase tracking-[3px] ${color}`}>{label}</span>
    </div>
  );
}

function Header() {
  const m = useMessages();

  return (
    <PageHero eyebrow={m.about.heroEyebrow} title={m.about.heroTitle}>
      <p className="m-0">{m.about.heroBody}</p>
    </PageHero>
  );
}

function Story() {
  const m = useMessages();

  return (
    <SandWatermarkSection variant="about-story" className="py-22 max-nav:py-14">
      <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-14 max-nav:grid-cols-1 max-nav:gap-7">
          <div>
            <Eyebrow label={m.about.storyEyebrow} color="text-[#8a7a2a]" />
            <h2 className="m-0 font-display text-[46px] font-extrabold uppercase leading-[0.98] tracking-[0.5px] text-ink max-nav:text-[34px]">
              {m.about.storyTitle}
            </h2>
          </div>
          <div>
            <p className="m-0 mb-[18px] font-body text-[17px] leading-[1.75] text-[#555]">
              {m.about.storyParagraphs[0]}
            </p>
            <p className="m-0 mb-[18px] font-body text-[17px] leading-[1.75] text-[#555]">
              {m.about.storyParagraphs[1]}
            </p>
            <p className="m-0 font-body text-[17px] leading-[1.75] text-[#555]">{m.about.storyParagraphs[2]}</p>
          </div>
        </div>
        <figure className="mt-14 max-nav:mt-9">
          <div className="aspect-[2048/946] overflow-hidden border border-line bg-[#dcdcd6]">
            <img src="/about-staff.webp" alt={m.about.teamImageAlt} className="h-full w-full object-cover" />
          </div>
        </figure>
      </div>
    </SandWatermarkSection>
  );
}

function StatsBand({ productRangeCount }: { productRangeCount: number }) {
  const m = useMessages();
  const stats = [...m.about.stats, { value: String(productRangeCount), label: m.about.equipmentRangesLabel }];

  return (
    <section className="bg-ink">
      <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
        <div className="grid grid-cols-3 max-nav:grid-cols-1">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="border-r border-[#2a2a2a] px-8 py-13 text-center last:border-r-0 max-nav:border-r-0 max-nav:border-b max-nav:border-[#2a2a2a] max-nav:py-8 max-nav:last:border-b-0"
            >
              <div className="font-display text-[58px] font-extrabold leading-[0.9] text-yellow">{stat.value}</div>
              <div className="mt-2.5 font-display text-[15px] font-semibold uppercase tracking-[2px] text-[#cfcfcf]">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Values() {
  const m = useMessages();

  return (
    <SandWatermarkSection variant="about-values" className="py-22 max-nav:py-14">
      <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
        <Eyebrow label={m.about.valuesEyebrow} color="text-[#8a7a2a]" />
        <h2 className="m-0 mb-11 font-display text-[46px] font-extrabold uppercase leading-[0.98] tracking-[0.5px] text-ink max-nav:text-[34px]">
          {m.about.valuesTitle}
        </h2>
        <div className="grid grid-cols-3 gap-6 max-nav:grid-cols-1">
          {m.about.values.map((value) => (
            <div key={value.num} className="border border-line bg-white px-[30px] py-[34px]">
              <div className="mb-[22px] flex h-14 w-14 items-center justify-center bg-ink">
                <span className="font-display text-[26px] font-extrabold text-yellow">{value.num}</span>
              </div>
              <h3 className="m-0 mb-3 font-display text-[24px] font-bold uppercase tracking-[0.5px] text-ink">
                {value.title}
              </h3>
              <p className="m-0 font-body text-[15.5px] leading-[1.65] text-[#666]">{value.body}</p>
            </div>
          ))}
        </div>
      </div>
    </SandWatermarkSection>
  );
}

function Timeline() {
  const m = useMessages();

  return (
    <section className="bg-[#ececea] py-20">
      <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
        <h2 className="m-0 mb-11 font-display text-[46px] font-extrabold uppercase leading-[0.98] tracking-[0.5px] text-ink max-nav:text-[34px]">
          {m.about.timelineTitle}
        </h2>
        <div className="grid grid-cols-4 gap-6 max-nav:grid-cols-2 max-xs:grid-cols-1">
          {m.about.milestones.map((milestone) => (
            <div key={milestone.year} className="border-t-4 border-gold pt-[22px]">
              <div className="mb-2.5 font-display text-[34px] font-extrabold text-ink">{milestone.year}</div>
              <p className="m-0 font-body text-[15.5px] leading-[1.6] text-[#555]">{milestone.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  const m = useMessages();

  return (
    <section className="bg-ink">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-10 px-12 py-18 max-nav:flex-col max-nav:items-start max-nav:gap-6 max-nav:px-5 max-nav:py-14">
        <div>
          <h2 className="m-0 mb-3 font-display text-[50px] font-extrabold uppercase leading-[0.98] tracking-[0.5px] text-white max-nav:text-[34px]">
            {m.about.ctaTitle}
          </h2>
          <p className="m-0 max-w-[560px] font-body text-[19px] text-[#bdbdbd]">{m.about.ctaBody}</p>
        </div>
        <Link
          to="/contact"
          className="flex flex-none items-center gap-3.5 bg-yellow px-[38px] py-5 font-display text-[20px] font-bold uppercase tracking-[1.5px] text-ink no-underline transition-colors hover:bg-gold"
        >
          {m.about.contactUs} <ArrowIcon />
        </Link>
      </div>
    </section>
  );
}

function AboutPage() {
  const { productRangeCount } = Route.useLoaderData();

  return (
    <main className="bg-sand">
      <Header />
      <Story />
      <StatsBand productRangeCount={productRangeCount} />
      <Values />
      <Timeline />
      <CtaBand />
    </main>
  );
}

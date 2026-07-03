import { IconArrowRight } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';

import { seoHead } from '../lib/seo.js';
import { getProductRangeCount } from '../server/catalog/ranges.js';

export const Route = createFileRoute('/about')({
  head: () =>
    seoHead({
      title: 'About — Jedidiah Equipment',
      description:
        'Jedidiah Equipment is rooted in real agricultural experience — farmers building heavy-duty, farm-tested equipment in South Africa since 2008.',
      path: '/about',
    }),
  loader: async () => ({ productRangeCount: await getProductRangeCount() }),
  component: AboutPage,
});

const STATS = [
  { value: 'Est. 2008', label: 'On the land' },
  { value: '100%', label: 'South African built' },
];

const VALUES = [
  {
    num: '01',
    title: 'Farm-Tested',
    body: 'Every machine is designed by people who farm and proven in real working conditions before it carries our name.',
  },
  {
    num: '02',
    title: 'Built to Last',
    body: 'Heavy-gauge materials, hard-faced wearing parts and protective finishes mean our equipment keeps working, season after season.',
  },
  {
    num: '03',
    title: 'Locally Backed',
    body: 'Designed and manufactured in South Africa, with parts and support close at hand when you need them.',
  },
];

const MILESTONES = [
  { year: '2008', text: 'Started out with a single bulldozer, taking on earthworks and land preparation.' },
  { year: '2011', text: 'Expanded into silage harvesting, slurry spreading and contract planting.' },
  { year: '2015', text: 'Began modifying and building our own implements to outperform the market.' },
  { year: 'Today', text: 'A full range of trailers, tanks, tillage and planting equipment, built in SA.' },
];

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
  return (
    <section className="relative overflow-hidden bg-ink">
      <img
        src="/hero-silage-harvest.jpg"
        alt=""
        aria-hidden="true"
        className="absolute top-0 right-0 h-full w-[55%] object-cover opacity-40 max-nav:w-full max-nav:opacity-20"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#161616_38%,rgba(22,22,22,0.3)_100%)]" />
      <div className="relative mx-auto max-w-[1320px] px-12 pt-18 pb-16 max-nav:px-5 max-nav:pt-12 max-nav:pb-13">
        <Eyebrow label="Who we are" color="text-yellow" />
        <h1 className="m-0 mb-4 max-w-[760px] font-display text-[72px] font-extrabold uppercase leading-[0.94] tracking-[0.5px] text-white max-nav:text-[44px]">
          Farmers Building for Farmers
        </h1>
        <p className="m-0 max-w-[600px] font-body text-[20px] leading-[1.55] text-[#cfcfcf]">
          From a single bulldozer to a full range of farm-built equipment — Jedidiah Equipment is rooted in real
          agricultural experience.
        </p>
      </div>
    </section>
  );
}

function Story() {
  return (
    <section className="mx-auto max-w-[1320px] px-12 py-22 max-nav:px-5 max-nav:py-14">
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-14 max-nav:grid-cols-1 max-nav:gap-7">
        <div>
          <Eyebrow label="Our Story" color="text-[#8a7a2a]" />
          <h2 className="m-0 font-display text-[46px] font-extrabold uppercase leading-[0.98] tracking-[0.5px] text-ink max-nav:text-[34px]">
            Born on the farm, proven in the field
          </h2>
        </div>
        <div>
          <p className="m-0 mb-[18px] font-body text-[17px] leading-[1.75] text-[#555]">
            Jedidiah began in 2008 with a single bulldozer and a willingness to take on the work others wouldn't.
            Earthworks led to land preparation, slurry spreading, silage harvesting and planting — and with every season
            came a deeper understanding of what farm equipment actually needs to survive.
          </p>
          <p className="m-0 mb-[18px] font-body text-[17px] leading-[1.75] text-[#555]">
            When the implements on the market couldn't keep up, we started building our own. What began as repairs and
            modifications grew into purpose-built machines designed around the realities of South African farming.
          </p>
          <p className="m-0 font-body text-[17px] leading-[1.75] text-[#555]">
            Today we design and manufacture a complete range of trailers, tanks, tillage and planting equipment —
            engineered for strength, durability and long-term performance, and backed by people who farm.
          </p>
        </div>
      </div>
      <figure className="mt-14 max-nav:mt-9">
        <div className="aspect-[2048/946] overflow-hidden border border-line bg-[#dcdcd6]">
          <img
            src="/about-staff.webp"
            alt="Jedidiah Equipment team standing outside the workshop"
            className="h-full w-full object-cover"
          />
        </div>
      </figure>
    </section>
  );
}

function StatsBand({ productRangeCount }: { productRangeCount: number }) {
  const stats = [...STATS, { value: String(productRangeCount), label: 'Equipment ranges' }];

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
  return (
    <section className="mx-auto max-w-[1320px] px-12 py-22 max-nav:px-5 max-nav:py-14">
      <Eyebrow label="What sets us apart" color="text-[#8a7a2a]" />
      <h2 className="m-0 mb-11 font-display text-[46px] font-extrabold uppercase leading-[0.98] tracking-[0.5px] text-ink max-nav:text-[34px]">
        Built different on purpose
      </h2>
      <div className="grid grid-cols-3 gap-6 max-nav:grid-cols-1">
        {VALUES.map((value) => (
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
    </section>
  );
}

function Timeline() {
  return (
    <section className="bg-[#ececea] py-20">
      <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
        <h2 className="m-0 mb-11 font-display text-[46px] font-extrabold uppercase leading-[0.98] tracking-[0.5px] text-ink max-nav:text-[34px]">
          The road so far
        </h2>
        <div className="grid grid-cols-4 gap-6 max-nav:grid-cols-2 max-xs:grid-cols-1">
          {MILESTONES.map((milestone) => (
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
  return (
    <section className="bg-ink">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-10 px-12 py-18 max-nav:flex-col max-nav:items-start max-nav:gap-6 max-nav:px-5 max-nav:py-14">
        <div>
          <h2 className="m-0 mb-3 font-display text-[50px] font-extrabold uppercase leading-[0.98] tracking-[0.5px] text-white max-nav:text-[34px]">
            Let's talk equipment
          </h2>
          <p className="m-0 max-w-[560px] font-body text-[19px] text-[#bdbdbd]">
            Whatever your operation looks like, we'll help you find the right machine for it.
          </p>
        </div>
        <Link
          to="/contact"
          className="flex flex-none items-center gap-3.5 bg-yellow px-[38px] py-5 font-display text-[20px] font-bold uppercase tracking-[1.5px] text-ink no-underline transition-colors hover:bg-gold"
        >
          Contact Us <ArrowIcon />
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

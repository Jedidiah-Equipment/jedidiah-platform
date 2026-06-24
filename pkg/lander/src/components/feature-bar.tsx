import { IconHome, IconShieldCheck, IconTruck, type Icon as TablerIcon } from '@tabler/icons-react';

type Feature = {
  Icon: TablerIcon;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    Icon: IconHome,
    title: 'South African Built',
    body: 'Proudly designed and manufactured in South Africa.',
  },
  {
    Icon: IconShieldCheck,
    title: 'Heavy-Duty Equipment',
    body: 'Engineered for strength, durability and long-term performance.',
  },
  {
    Icon: IconTruck,
    title: 'Trailer · Tillage · Tanker',
    body: 'A complete range of equipment for modern farming operations.',
  },
];

export function FeatureBar() {
  return (
    <div className="grid grid-cols-3 bg-[#121212]/[0.78] backdrop-blur-[2px] max-nav:grid-cols-1">
      {FEATURES.map((feature, index) => (
        <div
          key={feature.title}
          className={`flex items-start gap-[18px] px-8 py-7 max-nav:px-6 max-nav:py-[22px] ${
            index < FEATURES.length - 1 ? 'border-r border-white/[0.12] max-nav:border-r-0 max-nav:border-b' : ''
          }`}
        >
          <feature.Icon className="flex-none text-yellow" size={38} stroke={1.6} aria-hidden="true" />
          <div>
            <h4 className="m-0 mb-1.5 font-display text-[20px] font-bold uppercase tracking-[1px] text-white">
              {feature.title}
            </h4>
            <p className="m-0 font-body text-[14.5px] leading-[1.5] text-[#b5b5b5]">{feature.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

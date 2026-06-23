import type { ReactNode } from 'react';

type Feature = {
  icon: ReactNode;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: (
      <path
        d="M3 9.5l9-6 9 6M5 8.5V20h14V8.5M9.5 20v-5h5v5"
        stroke="#fff000"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    ),
    title: 'South African Built',
    body: 'Proudly designed and manufactured in South Africa.',
  },
  {
    icon: (
      <>
        <path
          d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"
          stroke="#fff000"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 12l2 2 4-4" stroke="#fff000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    title: 'Heavy-Duty Equipment',
    body: 'Engineered for strength, durability and long-term performance.',
  },
  {
    icon: (
      <>
        <path
          d="M2 16h2l1.5-5h9l2.5 5h3a2 2 0 0 1 2 2v0H2v-2z"
          stroke="#fff000"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="7" cy="19" r="1.6" stroke="#fff000" strokeWidth="1.6" />
        <circle cx="17" cy="19" r="1.6" stroke="#fff000" strokeWidth="1.6" />
      </>
    ),
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
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" className="flex-none" aria-hidden="true">
            {feature.icon}
          </svg>
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

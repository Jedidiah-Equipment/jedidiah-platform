type Feature = {
  iconSrc: string;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    iconSrc: '/feature-icons/sa-built.png',
    title: 'South African Built',
    body: 'Proudly designed and manufactured in South Africa.',
  },
  {
    iconSrc: '/feature-icons/heavy-duty.png',
    title: 'Heavy-Duty Equipment',
    body: 'Engineered for strength, durability and long-term performance.',
  },
  {
    iconSrc: '/feature-icons/trailer.png',
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
          <img src={feature.iconSrc} alt="" className="h-14 w-14 flex-none object-contain" aria-hidden="true" />
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

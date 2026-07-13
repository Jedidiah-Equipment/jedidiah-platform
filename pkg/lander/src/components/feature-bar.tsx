type Feature = {
  iconSrc: string;
  title: string;
  body: string;
};

import { useMessages } from '../messages/index.js';

export function FeatureBar() {
  const m = useMessages();
  const features: Feature[] = [
    { iconSrc: '/feature-icons/sa-built.png', ...m.featureBar.southAfricanBuilt },
    { iconSrc: '/feature-icons/heavy-duty.png', ...m.featureBar.heavyDutyEquipment },
    { iconSrc: '/feature-icons/trailer.png', ...m.featureBar.equipmentRange },
  ];

  return (
    <div className="grid grid-cols-3 bg-[#121212]/[0.78] backdrop-blur-[2px] max-nav:grid-cols-1">
      {features.map((feature, index) => (
        <div
          key={feature.title}
          className={`flex items-start gap-[18px] px-8 py-7 max-nav:px-6 max-nav:py-[22px] ${
            index < features.length - 1 ? 'border-r border-white/[0.12] max-nav:border-r-0 max-nav:border-b' : ''
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

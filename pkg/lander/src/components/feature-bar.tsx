import { FEATURE_ICONS, type FixedImage } from '../assets/images.js';
import { useMessages } from '../messages/index.js';

type Feature = {
  icon: FixedImage;
  title: string;
  body: string;
};

export function FeatureBar() {
  const m = useMessages();
  const features: Feature[] = [
    { icon: FEATURE_ICONS.saBuilt, ...m.featureBar.southAfricanBuilt },
    { icon: FEATURE_ICONS.heavyDuty, ...m.featureBar.heavyDutyEquipment },
    { icon: FEATURE_ICONS.trailer, ...m.featureBar.equipmentRange },
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
          {/* Decorative, and sits at the fold on desktop. `low` keeps it out of React's preload set without
              deferring it the way `loading="lazy"` would. */}
          <img
            src={feature.icon.src}
            width={feature.icon.width}
            height={feature.icon.height}
            fetchPriority="low"
            alt=""
            aria-hidden="true"
            className="h-14 w-14 flex-none object-contain"
          />
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

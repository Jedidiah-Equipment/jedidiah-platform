import type { HomeRange } from '../server/ranges-data.js';

// Neutral placeholder shown until the image-routes slice streams real Range imagery. Mirrors the
// prototype's brand thumbnail (dark field, yellow skew marks) rather than fabricating a photo.
function RangePlaceholder() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink transition-transform duration-500 ease-out group-hover:scale-[1.06]">
      <span className="flex flex-col items-center gap-[6px]">
        <span className="h-[10px] w-[58px] -skew-x-[20deg] bg-yellow" />
        <span className="h-[10px] w-[38px] -skew-x-[20deg] bg-yellow" />
      </span>
      <span className="font-display text-[22px] font-extrabold italic tracking-[2px] text-white">JEDIDIAH</span>
      <span className="font-display text-[11px] font-semibold tracking-[10px] text-[#9a9a9a]">EQUIPMENT</span>
    </div>
  );
}

export function RangeCard({ range }: { range: HomeRange }) {
  return (
    <a
      href={range.href}
      className="group flex flex-col border border-line bg-white no-underline shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1.5 hover:border-gold hover:shadow-[0_18px_40px_rgba(0,0,0,0.16)]"
    >
      <div className="relative aspect-[16/11] overflow-hidden bg-[#dcdcd6]">
        <RangePlaceholder />
      </div>
      <div className="flex flex-1 flex-col px-[22px] pt-6 pb-[26px]">
        <span className="mb-4 h-1 w-9 bg-gold" />
        <h3 className="m-0 mb-3 font-display text-[23px] font-bold uppercase leading-[1.05] tracking-[0.5px] text-ink">
          {range.name}
        </h3>
        <p className="m-0 mb-5 flex-1 font-body text-[15px] leading-[1.55] text-[#666]">{range.description}</p>
        <svg
          width="26"
          height="14"
          viewBox="0 0 26 14"
          fill="none"
          className="transition-transform duration-300 ease-out group-hover:translate-x-2"
          aria-hidden="true"
        >
          <path
            d="M1 7h23M18 1l6 6-6 6"
            stroke="#f8d300"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </a>
  );
}

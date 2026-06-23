import type { HomeRange } from '../server/ranges-data.js';

export function RangeCard({ range }: { range: HomeRange }) {
  return (
    <a
      href={range.href}
      className="group flex flex-col border border-line bg-white no-underline shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1.5 hover:border-gold hover:shadow-[0_18px_40px_rgba(0,0,0,0.16)]"
    >
      <div className="relative aspect-[16/11] overflow-hidden bg-ink">
        {/* The image route streams the real Range image or a neutral brand placeholder, so this never
            renders broken. */}
        <img
          src={range.imageUrl}
          alt={range.name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
        />
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

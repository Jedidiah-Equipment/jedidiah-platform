import { IconArrowRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

import type { HomeRange } from '../server/catalog/ranges-data.js';

export function RangeCard({ range }: { range: HomeRange }) {
  return (
    // The <Link> is the (stationary) hover target; the lift lives on the inner card so its moving edge never
    // slides out from under the cursor and flickers the hover on/off.
    <Link
      to="/{-$locale}/products"
      search={{ range: range.slug }}
      resetScroll={false}
      className="group block no-underline"
    >
      <div className="flex h-full flex-col border border-line bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-[translate,box-shadow,border-color] duration-[450ms] ease-in-out group-hover:-translate-y-1.5 group-hover:border-gold group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.16)]">
        <div className="relative aspect-[16/11] overflow-hidden bg-ink">
          {/* The image route streams the real Range image or a neutral brand placeholder, so this never
              renders broken. */}
          <img
            src={range.imageUrl}
            alt={range.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[450ms] ease-in-out group-hover:scale-[1.06]"
          />
        </div>
        <div className="flex flex-1 flex-col px-[22px] pt-6 pb-[26px]">
          <span className="mb-4 h-1 w-9 bg-gold" />
          <h3 className="m-0 mb-3 font-display text-[23px] font-bold uppercase leading-[1.05] tracking-[0.5px] text-ink">
            {range.name}
          </h3>
          <p className="m-0 mb-3 font-body text-[15px] leading-[1.55] text-[#666]">{range.description}</p>
          <IconArrowRight
            className="text-gold transition-transform duration-300 ease-out group-hover:translate-x-2"
            size={24}
            stroke={2.4}
            aria-hidden="true"
          />
        </div>
      </div>
    </Link>
  );
}

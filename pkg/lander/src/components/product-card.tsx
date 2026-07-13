import { IconArrowRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useMessages } from '../messages/index.js';
import type { CatalogProduct } from '../server/catalog/products-data.js';

// Reusable Product card shared by the Products page (and, later, related-Product strips). The image route
// streams the brochure hero or a neutral brand placeholder, so the image never renders broken.
export function ProductCard({ product }: { product: CatalogProduct }) {
  const m = useMessages();

  return (
    // The <Link> is the (stationary) hover target; the lift lives on the inner card. Transforming the link
    // itself would slide its bottom edge out from under the cursor and flicker the hover on/off.
    <Link to="/products/$modelCode" params={{ modelCode: product.modelCode }} className="group block no-underline">
      <div className="flex h-full flex-col border border-line bg-white shadow-[0_1px_3px_rgba(0,0,0,0.07)] transition-[translate,box-shadow,border-color] duration-[450ms] ease-in-out group-hover:-translate-y-1.5 group-hover:border-gold group-hover:shadow-[0_14px_34px_rgba(0,0,0,0.14)]">
        <div className="relative aspect-[16/10] overflow-hidden bg-ink">
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[450ms] ease-in-out group-hover:scale-[1.05]"
          />
          <span className="absolute top-3.5 left-3.5 bg-yellow px-3 py-[5px] font-display text-[12px] font-bold uppercase tracking-[1.5px] text-ink">
            {product.modelCode}
          </span>
        </div>
        <div className="flex flex-1 flex-col px-[22px] pt-[22px] pb-6">
          <h3 className="m-0 mb-2 font-display text-[24px] font-bold uppercase leading-[1.02] tracking-[0.5px] text-ink">
            {product.name}
          </h3>
          <p className="m-0 mb-5 line-clamp-3 flex-1 font-body text-[15px] leading-[1.5] text-[#666]">
            {product.description}
          </p>
          <span className="flex items-center gap-3 font-display text-[15px] font-bold uppercase tracking-[1.5px] text-ink">
            {m.productCard.viewDetails}
            <IconArrowRight
              className="text-gold transition-transform duration-300 ease-out group-hover:translate-x-2"
              size={24}
              stroke={2.4}
              aria-hidden="true"
            />
          </span>
        </div>
      </div>
    </Link>
  );
}

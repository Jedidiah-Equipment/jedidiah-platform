import type { CatalogProduct } from '../server/products-data.js';

// Reusable Product card shared by the Products page (and, later, related-Product strips). The image route
// streams the brochure hero or a neutral brand placeholder, so the image never renders broken.
export function ProductCard({ product }: { product: CatalogProduct }) {
  return (
    <a
      href={product.href}
      className="group flex flex-col border border-line bg-white no-underline shadow-[0_1px_3px_rgba(0,0,0,0.07)] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1.5 hover:border-gold hover:shadow-[0_14px_34px_rgba(0,0,0,0.14)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-ink">
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
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
          View Details
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
        </span>
      </div>
    </a>
  );
}

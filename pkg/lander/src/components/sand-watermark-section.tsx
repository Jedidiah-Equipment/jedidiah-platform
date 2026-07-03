import beetleMarkUrl from '@pkg/domain/assets/brand/jedidiah-mark-black.png';
import type { ReactNode } from 'react';

type SandWatermarkVariant =
  | 'about-story'
  | 'about-values'
  | 'contact'
  | 'home-ranges'
  | 'product-detail'
  | 'product-not-found'
  | 'products-catalog';

type SandWatermarkSectionProps = {
  children: ReactNode;
  className?: string;
  variant: SandWatermarkVariant;
};

const WATERMARK_VARIANTS: Record<SandWatermarkVariant, string> = {
  'about-story':
    'top-[39%] right-[-125px] w-[680px] rotate-[5deg] max-nav:top-[36%] max-nav:right-[-170px] max-nav:w-[470px]',
  'about-values':
    'top-[48%] right-[-185px] w-[720px] rotate-[-10deg] max-nav:top-[46%] max-nav:right-[-215px] max-nav:w-[510px]',
  contact:
    'top-[41%] right-[-155px] w-[660px] rotate-[8deg] max-nav:top-[38%] max-nav:right-[-200px] max-nav:w-[470px]',
  'home-ranges':
    'top-[42%] right-[-170px] w-[760px] rotate-[-8deg] max-nav:top-[39%] max-nav:right-[-215px] max-nav:w-[530px]',
  'product-detail':
    'top-[45%] right-[-130px] w-[700px] rotate-[3deg] max-nav:top-[42%] max-nav:right-[-190px] max-nav:w-[500px]',
  'product-not-found':
    'top-[36%] right-[-110px] w-[620px] rotate-[-5deg] max-nav:top-[35%] max-nav:right-[-180px] max-nav:w-[460px]',
  'products-catalog':
    'top-[43%] right-[-205px] w-[780px] rotate-[7deg] max-nav:top-[40%] max-nav:right-[-240px] max-nav:w-[540px]',
};

export function SandWatermarkSection({ children, className, variant }: SandWatermarkSectionProps) {
  return (
    <section className={`relative isolate overflow-hidden bg-sand ${className ?? ''}`}>
      <img
        src={beetleMarkUrl}
        alt=""
        aria-hidden="true"
        className={`pointer-events-none absolute z-0 -translate-y-1/2 opacity-[0.045] mix-blend-multiply ${WATERMARK_VARIANTS[variant]}`}
      />
      <div className="relative z-10">{children}</div>
    </section>
  );
}

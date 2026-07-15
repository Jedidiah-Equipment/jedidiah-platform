import type { ReactNode } from 'react';

type PageHeroProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
  showBackgroundImage?: boolean;
};

export function PageHero({ children, eyebrow, showBackgroundImage = true, title }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden bg-ink">
      {showBackgroundImage ? (
        <>
          <img
            src="/hero-silage-harvest.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-[1.01] object-cover object-[58%_52%] blur-[1.5px]"
          />
          <div className="absolute inset-0 bg-ink/55" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,15,15,0.92)_0%,rgba(15,15,15,0.76)_34%,rgba(15,15,15,0.48)_68%,rgba(15,15,15,0.62)_100%)] max-nav:bg-[linear-gradient(180deg,rgba(15,15,15,0.92)_0%,rgba(15,15,15,0.76)_100%)]" />
        </>
      ) : null}
      <div className="relative mx-auto max-w-[1320px] px-12 pt-16 pb-14 max-nav:px-5 max-nav:pt-12 max-nav:pb-11">
        <div>
          <div className="mb-4 flex items-center gap-3.5">
            <span className="h-1 w-[42px] bg-yellow" />
            <span className="font-display text-[15px] font-semibold uppercase tracking-[3px] text-yellow">
              {eyebrow}
            </span>
          </div>
          <h1 className="m-0 mb-3.5 font-display text-[68px] font-extrabold uppercase leading-[0.95] tracking-[0.5px] text-white max-nav:text-[44px] max-xs:text-[40px]">
            {title}
          </h1>
          <div className="max-w-[620px] font-body text-[19px] leading-[1.55] text-[#bdbdbd] max-nav:text-[17px]">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

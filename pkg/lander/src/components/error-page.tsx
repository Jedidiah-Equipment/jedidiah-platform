import { Link, useMatch, useRouter } from '@tanstack/react-router';

import { CANONICAL_LOCALE } from '../lib/locale.js';
import { messagesForLocale } from '../messages/index.js';
import { SandWatermarkSection } from './sand-watermark-section.js';

// Branded fallback for the router's default error boundary. It replaces TanStack Router's blank default
// screen when a route loader throws, and offers a retry because these failures are transient — the same URL
// loads on a second attempt. `router.invalidate` re-runs the loaders, so a successful retry swaps this
// component out for the real page.
export function LanderErrorPage() {
  // A root or locale-layout loader failure renders this above the LocaleProvider, so read the locale from the
  // layout match — its beforeLoad sets `context.locale` before the loader that threw — and fall back to the
  // Canonical Locale, the same defence RootDocument uses.
  const localeMatch = useMatch({ from: '/{-$locale}', shouldThrow: false });
  const m = messagesForLocale(localeMatch?.context.locale ?? CANONICAL_LOCALE);
  const router = useRouter();

  return (
    <main className="bg-sand">
      <SandWatermarkSection variant="product-not-found" className="py-32 text-center max-nav:py-20">
        <div className="mx-auto max-w-[1320px] px-12 max-nav:px-5">
          <span className="font-display text-[15px] font-semibold uppercase tracking-[3px] text-bronze">
            {m.error.eyebrow}
          </span>
          <h1 className="mt-3.5 mb-4 font-display text-[56px] font-extrabold uppercase leading-[0.94] tracking-[0.5px] text-ink max-nav:text-[40px]">
            {m.error.title}
          </h1>
          <p className="m-0 mb-8 font-body text-[19px] leading-[1.6] text-[#555]">{m.error.body}</p>
          <div className="flex flex-wrap items-center justify-center gap-3.5">
            <button
              type="button"
              onClick={() => void router.invalidate()}
              className="inline-flex items-center gap-3 bg-gold px-[30px] py-[17px] font-display text-[18px] font-bold uppercase tracking-[1.5px] text-ink transition-colors hover:bg-yellow"
            >
              {m.error.retry}
            </button>
            <Link
              to="/{-$locale}/products"
              className="inline-flex items-center gap-3 bg-ink px-[30px] py-[17px] font-display text-[18px] font-bold uppercase tracking-[1.5px] text-white no-underline transition-colors hover:bg-black"
            >
              {m.error.viewAllProducts}
            </Link>
          </div>
        </div>
      </SandWatermarkSection>
    </main>
  );
}

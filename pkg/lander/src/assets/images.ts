// The Lander's presentation imagery, as `<img>`-ready descriptors.
//
// Every URL here is a Vite-hashed import of a file written by `scripts/optimize-assets.ts`, so the bytes
// are content-addressed and served immutably. Intrinsic dimensions come from the generated manifest rather
// than being retyped, so an `<img>` can always reserve its box before the bytes land.

import aboutStaff768 from './generated/about-staff-768.webp';
import aboutStaff1224 from './generated/about-staff-1224.webp';
import aboutStaff2048 from './generated/about-staff-2048.webp';
import { SOURCE_DIMENSIONS } from './generated/dimensions.js';
import featureHeavyDuty from './generated/feature-heavy-duty-168.webp';
import featureSaBuilt from './generated/feature-sa-built-168.webp';
import featureTrailer from './generated/feature-trailer-168.webp';
import hero640 from './generated/hero-silage-harvest-640.webp';
import hero960 from './generated/hero-silage-harvest-960.webp';
import hero1280 from './generated/hero-silage-harvest-1280.webp';
import hero1600 from './generated/hero-silage-harvest-1600.webp';
import logo480 from './generated/jedidiah-logo-480.webp';
import logoFull560 from './generated/jedidiah-logo-full-560.webp';
import markBlack583 from './generated/jedidiah-mark-black-583.webp';
import ogCard1200 from './generated/og-card-1200.jpeg';

/** An image the browser picks a width for, plus the ratio it needs to reserve space. */
export type ResponsiveImage = {
  /** Fallback for the `src` attribute. Only used by clients that ignore `srcSet`. */
  src: string;
  srcSet: string;
  /** Intrinsic size of the master, for `width`/`height` attributes. */
  height: number;
  width: number;
};

/** A single-width image, still carrying its ratio. */
export type FixedImage = { src: string; height: number; width: number };

function srcSet(entries: [url: string, width: number][]): string {
  return entries.map(([url, width]) => `${url} ${width}w`).join(', ');
}

// Full-bleed on the homepage, so a viewport-width candidate is the right pick at every breakpoint.
export const HERO_IMAGE: ResponsiveImage = {
  src: hero1280,
  srcSet: srcSet([
    [hero640, 640],
    [hero960, 960],
    [hero1280, 1280],
    [hero1600, 1600],
  ]),
  ...SOURCE_DIMENSIONS['hero-silage-harvest'],
};

// The same photograph behind a secondary page's heading, where a blur and a 55% scrim sit over it. The two
// largest candidates are omitted: nothing at that resolution survives the treatment.
export const HERO_BACKDROP_IMAGE: ResponsiveImage = {
  src: hero960,
  srcSet: srcSet([
    [hero640, 640],
    [hero960, 960],
  ]),
  ...SOURCE_DIMENSIONS['hero-silage-harvest'],
};

export const ABOUT_STAFF_IMAGE: ResponsiveImage = {
  src: aboutStaff1224,
  srcSet: srcSet([
    [aboutStaff768, 768],
    [aboutStaff1224, 1224],
    [aboutStaff2048, 2048],
  ]),
  ...SOURCE_DIMENSIONS['about-staff'],
};

// The site-wide social card. JPEG at Open Graph's documented 1200x630, because the scrapers still refuse
// WebP and crop anything that is not that shape.
export const OG_CARD: FixedImage = { src: ogCard1200, ...SOURCE_DIMENSIONS['og-card'] };

export const NAV_LOGO: FixedImage = { src: logo480, ...SOURCE_DIMENSIONS['jedidiah-logo'] };
export const FOOTER_LOGO: FixedImage = { src: logoFull560, ...SOURCE_DIMENSIONS['jedidiah-logo-full'] };
export const WATERMARK_MARK: FixedImage = { src: markBlack583, ...SOURCE_DIMENSIONS['jedidiah-mark-black'] };

export const FEATURE_ICONS = {
  heavyDuty: { src: featureHeavyDuty, ...SOURCE_DIMENSIONS['feature-heavy-duty'] },
  saBuilt: { src: featureSaBuilt, ...SOURCE_DIMENSIONS['feature-sa-built'] },
  trailer: { src: featureTrailer, ...SOURCE_DIMENSIONS['feature-trailer'] },
} satisfies Record<string, FixedImage>;

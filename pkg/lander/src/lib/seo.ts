import { OG_CARD } from '../assets/images.js';
import { CANONICAL_LOCALE, LOCALE_METADATA, LOCALES, type Locale, localePath } from './locale.js';
import { siteOrigin } from './site-origin.js';

// Configured public site origin, used only for the sitemap `<loc>` entries and the robots.txt `Sitemap:`
// line: those files are fetched by crawlers without a page context and their specs require fully-qualified
// production URLs. Page head tags instead derive their origin from the serving host via siteOrigin(), so
// staging pages advertise staging URLs and production pages advertise production URLs. Overridable per
// environment via the build-time, client-safe VITE_SITE_URL, defaulting to the live domain.
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://jedidiahequipment.co.za').replace(/\/+$/, '');

// Open Graph fallback for every page without its own image (Home, Products, About, Contact). A JPEG crop of
// the hero photo at Open Graph's card size, built by scripts/optimize-assets.ts; product pages override it
// with their own. Content-hashed, so it stays a root-relative path that absoluteUrl() can qualify.
export const DEFAULT_OG_IMAGE: string = OG_CARD.src;

// The type and dimensions of whatever this site puts in an og:image. Declaring them lets WhatsApp and
// LinkedIn reserve the card's box before the bytes arrive, instead of laying it out twice or skipping it.
//
// Every og:image here is the same shape, which is what makes one shared set of tags honest: the static card
// above is cropped to Open Graph's size by the asset script, and a Product's own card comes from @pkg/core's
// `jpeg` transform, cropped to the same box. seo.test.ts holds those two sizes together — declaring
// dimensions that disagree with the bytes is worse than declaring none.
export const OG_IMAGE_META = [
  { property: 'og:image:type', content: 'image/jpeg' },
  { property: 'og:image:width', content: String(OG_CARD.width) },
  { property: 'og:image:height', content: String(OG_CARD.height) },
];

// Qualifies a root-relative path against the origin of the host serving this response. Open Graph and
// Twitter Card scrapers (Slack, WhatsApp, X, LinkedIn, ...) do not resolve relative URLs in meta tags, so
// every URL-valued head tag must go through this.
export function absoluteUrl(path: string): string {
  return `${siteOrigin()}${path}`;
}

// Search engines truncate meta descriptions around 155–160 characters. Trim on a word boundary and append
// an ellipsis so the snippet reads cleanly instead of cutting mid-word.
export function truncateDescription(text: string, max = 160): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) {
    return trimmed;
  }

  const slice = trimmed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

export type SeoInput = {
  title: string;
  description: string;
  locale: Locale;
  // Root-relative path for this page, e.g. "/products". Also the canonical target, so pass the clean path
  // without query params (e.g. "/products", never "/products?range=...").
  path: string;
  // Root-relative image URL; defaults to the site OG image.
  image?: string;
};

// Builds a page's head fragment: a distinct <title> + description, the matching Open Graph and Twitter card
// tags, and a self-referencing canonical link. URL-valued tags are qualified against the serving host, so
// each environment advertises its own URLs (staging previews show staging images) and the canonical
// collapses query-param variants (footer/chip links generate /products?range=...) onto the clean path.
// Spread into a route's `head()` return so the per-page values override the site defaults set on the root
// route.
export function seoHead({ title, description, locale, path, image = DEFAULT_OG_IMAGE }: SeoInput) {
  const canonicalPath = localePath(path, CANONICAL_LOCALE);
  const localizedPath = localePath(path, locale);
  const url = absoluteUrl(localizedPath);
  const imageUrl = absoluteUrl(image);

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:locale', content: LOCALE_METADATA[locale].openGraphLocale },
      { property: 'og:image', content: imageUrl },
      ...OG_IMAGE_META,
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: imageUrl },
    ],
    links: [
      { rel: 'canonical', href: url },
      ...LOCALES.map((alternate) => ({
        rel: 'alternate',
        hrefLang: alternate,
        href: absoluteUrl(localePath(path, alternate)),
      })),
      { rel: 'alternate', hrefLang: 'x-default', href: absoluteUrl(canonicalPath) },
    ],
  };
}

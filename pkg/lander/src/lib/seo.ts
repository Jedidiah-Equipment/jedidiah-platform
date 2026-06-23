// Single source of truth for the public site origin used in canonical and Open Graph URLs (issue #570).
// A canonical tag must always point at the production domain regardless of which host served the response,
// so this is a fixed, configured value rather than something derived from the request. Overridable per
// environment via the build-time, client-safe VITE_SITE_URL, defaulting to the live domain.
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://jedidiahequipment.co.za').replace(/\/+$/, '');

// Open Graph fallback for every page without its own image (Home, Products, About, Contact). The hero photo
// ships in public/ and reads well as a representative brand card; product pages override it with their hero.
export const DEFAULT_OG_IMAGE = '/hero-trailer.jpg';

// Joins a site-relative path onto the origin. Absolute inputs (an already-qualified URL) pass through so
// callers can hand in either form.
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
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
  // Site-relative path for this page, e.g. "/products".
  path: string;
  // Site-relative or absolute image URL; defaults to the site OG image.
  image?: string;
};

// Builds a page's head fragment: a distinct <title> + description, the matching Open Graph and Twitter card
// tags (with absolute image + url), and a canonical link. Spread into a route's `head()` return so the
// per-page values override the site defaults set on the root route.
export function seoHead({ title, description, path, image = DEFAULT_OG_IMAGE }: SeoInput) {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: imageUrl },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: imageUrl },
    ],
    links: [{ rel: 'canonical', href: url }],
  };
}

// Public site origin, used only where a URL must be absolute regardless of the serving host: the sitemap
// `<loc>` entries and the robots.txt `Sitemap:` line, which those specs require to be fully qualified. Page
// tags (og:url, og:image, twitter:image) instead emit root-relative paths so they resolve against whatever
// host served the response — production or staging — rather than being pinned to one domain. Overridable per
// environment via the build-time, client-safe VITE_SITE_URL, defaulting to the live domain.
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://jedidiahequipment.co.za').replace(/\/+$/, '');

// Open Graph fallback for every page without its own image (Home, Products, About, Contact). The hero photo
// ships in public/ and reads well as a representative brand card; product pages override it with their hero.
export const DEFAULT_OG_IMAGE = '/hero-trailer.jpg';

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
  // Root-relative path for this page, e.g. "/products".
  path: string;
  // Root-relative image URL; defaults to the site OG image.
  image?: string;
};

// Builds a page's head fragment: a distinct <title> + description and the matching Open Graph and Twitter
// card tags. URLs stay root-relative so they resolve against the serving host (no canonical link, no pinned
// production origin — so staging serves staging images). Spread into a route's `head()` return so the
// per-page values override the site defaults set on the root route.
export function seoHead({ title, description, path, image = DEFAULT_OG_IMAGE }: SeoInput) {
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: path },
      { property: 'og:image', content: image },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
    ],
  };
}

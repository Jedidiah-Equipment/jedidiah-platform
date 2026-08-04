import { fileURLToPath } from 'node:url';

/**
 * The app's favicon, the same yellow mark `pkg/web` and `pkg/lander` show.
 *
 * `@pkg/domain/assets/brand` is where it actually lives; the two of them import it from there. A
 * VitePress site can only serve what sits in its `public` directory, so this one keeps a copy — and
 * `favicon.test.ts` compares the bytes, so the copy cannot quietly fall behind the brand.
 */
export const FAVICON_FILENAME = 'jedidiah-favicon-yellow.png';

export const DOCS_FAVICON_PATH = fileURLToPath(new URL(`../content/public/${FAVICON_FILENAME}`, import.meta.url));

export const BRAND_FAVICON_PATH = fileURLToPath(
  new URL(`../../domain/assets/brand/${FAVICON_FILENAME}`, import.meta.url),
);

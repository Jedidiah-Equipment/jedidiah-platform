# lander (@pkg/lander)

- Public read-only TanStack Start SSR site. It calls `@pkg/core` read services against its own DB client
  and storage adapter rather than the authenticated API, and must never run migrations. See ADR 0007.
- Keep `ANALYTICS.md` in sync with the typed event registry whenever Lander analytics change.

## Presentation images and fonts

- Full-resolution masters live in `assets/sources/` (and `@pkg/domain/assets/brand`) and are never served.
  `pnpm --filter @pkg/lander assets:optimize` writes the sized WebP variants and `dimensions.ts` into
  `src/assets/generated/`; re-run it after replacing a master and commit the output. Reach for those
  variants through `src/assets/images.ts`, never a `public/` path — a generated file is content-hashed by
  Vite and served immutably, a `public/` file is not.
- Every `<img>` carries `width`/`height`. Above the fold, the one element that is the LCP gets
  `fetchPriority="high"`; everything else gets `loading="lazy"` (below the fold) or `fetchPriority="low"`
  (decorative, at the fold). React hoists a preload for any other eagerly-rendered image, and those
  preloads compete with the LCP for bandwidth.
- Web fonts are self-hosted from `@pkg/domain/fonts` and declared per weight. Adding a weight to a
  `font-display`/`font-body` element means adding a face; do not re-introduce a webfont CDN.
- Catalog imagery (Range and Product photos) is resized on demand by the image routes, at the widths in
  `CATALOG_IMAGE_WIDTHS` (`@pkg/core`) and no others — an open width parameter would let any caller mint
  unbounded cache entries and sharp work. A view model exposes both `imageUrl` and `imageSrcSet`; render
  both, and give the `<img>` a `sizes` that describes the grid it actually sits in. A URL naming no width
  still serves the 1280px encode, so older links keep working.

## Localization

- Follow `docs/adr/0011-lander-localization.md` and the Lander Localization vocabulary in `CONTEXT.md`.
- `src/messages/types.ts` is the single source of truth for static-copy shape. Every locale dictionary must
  conform to `Messages` without `any` or casts; do not introduce an i18n library.
- All user-facing static copy belongs in the dictionaries — SEO titles/descriptions, aria labels, alt text,
  placeholders, and validation/success/error messages included. When unsure about a proper noun, extract it
  and repeat the English value.
- Use function-valued message keys for interpolation; never assemble translated sentences from fragments at
  the call site.
- Components read messages through `useMessages()`. Server-only code and route `head()` functions take an
  explicit locale dictionary instead of React hooks.
- Catalog-authored Product, Range, Variant, and Assembly text stays out of the static dictionaries — it
  comes from persisted locale-keyed data with per-field Canonical Text fallback.
- English is the Canonical Locale at unprefixed URLs; other locales use prefixed URL trees. Translated text
  must never change slugs, Model Code, or URL parameters.

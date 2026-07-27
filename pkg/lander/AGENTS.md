# lander (@pkg/lander)

- Public read-only TanStack Start SSR site. It calls `@pkg/core` read services against its own DB client
  and storage adapter rather than the authenticated API, and must never run migrations. See ADR 0007.
- Keep `ANALYTICS.md` in sync with the typed event registry whenever Lander analytics change.

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

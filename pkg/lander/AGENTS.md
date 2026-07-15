# AGENTS.md

- Keep `ANALYTICS.md` in sync with the typed event registry whenever Lander analytics change.

## Localization

- Follow `docs/adr/0011-lander-localization.md` and the Lander Localization vocabulary in `CONTEXT.md`.
- `src/messages/types.ts` is the single source of truth for static-copy shape. Every locale dictionary must conform to `Messages` without `any` or casts; do not introduce an i18n library.
- Put all user-facing static copy in the dictionaries, including SEO titles/descriptions, aria labels, alt text, placeholders, and validation/success/error messages. When unsure about a proper noun, extract it and repeat the English value where appropriate.
- Use function-valued message keys for interpolation. Do not assemble translated sentences from fragments at call sites.
- Rendered components read messages through `useMessages()`. Server-only code and route `head()` functions use an explicit locale dictionary rather than React hooks.
- Do not move catalog-authored Product, Range, Variant, or Assembly text into static dictionaries. Catalog translations come from persisted locale-keyed data with per-field Canonical Text fallback; Model Code and URL parameters remain locale-invariant.
- English is the Canonical Locale at unprefixed URLs. Other locales use prefixed URL trees; translated text must not change slugs or URL parameters.

# Lander Localization via On-Row AI Translations

The public Lander becomes locale-keyed (issue #815): English stays canonical at unprefixed URLs, and
Afrikaans is served from a `/af/…` URL tree. Catalog Translations are stored as a locale-keyed
`translations` jsonb column on each source table (`products`, `product_assemblies`, `product_ranges`,
`product_range_variants`) and are written exclusively by an AI translation pipeline running in-process
in `@pkg/api`, where all catalog mutations already happen. Static Lander copy uses hand-rolled typed
TypeScript dictionaries (`en.ts` / `af.ts` conforming to one `Messages` type), not an i18n library.

## Considered Options

- **URL strategy — cookie/state toggle on one URL set.** Rejected: crawlers would only ever see one
  language per URL, so Afrikaans pages would be invisible to Afrikaans searchers and shared links would
  not carry the language. Chosen instead: path prefix (`/af/…`), English unchanged at the root so
  existing indexed URLs survive, `hreflang` alternates and both trees in the sitemap. Visitor locale
  preference lives in a cookie (not localStorage — SSR must see it before first byte): auto-detected
  from `Accept-Language` on first visit, overwritten by explicit dropdown choice, honored with 302
  redirects on entry. Crawlers send neither `af` Accept-Language nor cookies, so they always see
  canonical pages.
- **Translation storage — per-entity translation tables or one generic `(entity, field, locale)`
  table.** Rejected: array fields (`keyFeatures`) pivot badly, every Lander read gains joins, and
  translations have exactly one writer so relational granularity buys nothing. The on-row jsonb blob
  mirrors the source field shape, travels with the row through the existing single-pass catalog reads,
  and stores the source-content hash it was generated from — making staleness derivable state.
- **Execution — message broker (RabbitMQ) or DB-backed job queue.** Rejected for now: the workload is a
  few AI calls a day with one producer and one consumer, and the stated requirement (dedup under the
  admin UI's save-per-field-change behavior) is coalescing, which brokers do not provide — every
  intermediate save would still be translated. Chosen instead: an in-process per-entity single-flight
  scheduler in `@pkg/api` — debounce after the last edit, at most one in-flight translation per entity,
  a dirty flag re-runs with current content, and a hash match skips entirely. One editing session costs
  one AI call. Lost in-memory state (deploy/crash) loses only the schedule, never the truth: the stale
  hash remains queryable, healed by a manual admin "retranslate stale" action. No cron. This relies on
  the API running as a single replica; if that changes, add a DB-level claim (e.g. `translating_since`
  column) or graduate to a Postgres-backed queue — a broker only enters if the platform grows real
  multi-service messaging.
- **Human review gate on translations.** Rejected: an unreviewed queue would silently decay the
  Afrikaans site to English fallbacks, which is worse than an occasional imperfect machine translation
  of low-risk marketing copy. Corrections arrive as re-edits or future admin overrides.

## Consequences

- English is the only authored language. Everything is translatable except `modelCode`; slugs and URL
  params derive from Canonical Text only, so URLs are locale-stable.
- The Lander stays read-only (ADR 0007): it selects display text from `translations` with per-field
  fallback to Canonical Text, and never writes.
- The translation unit is the Product bundle (product + its assemblies in one AI call, via the existing
  `@pkg/ai` OpenAI client with a structured-output schema and a pinned terminology prompt); Ranges and
  Variants translate as their own units.
- Static copy maintenance is enforced by the compiler: a new string without an `af` key is a type
  error, so untranslated static copy cannot ship.
- The brochure PDF becomes locale-aware using the same stored Translations plus a small label
  dictionary in `@pkg/pdf`.
- A stale Translation keeps serving until regenerated (no flash-to-English on edit); a missing one
  falls back to English per field.

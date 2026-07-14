# Lander Localization with Per-Field Translation Envelopes

English is the Canonical Locale for the public Lander and remains at unprefixed URLs. Afrikaans is
served from `/af/…`; locale preference is stored in a cookie so SSR and redirects agree, while an
explicit locale-prefixed URL wins for crawlers and shared links. Static Lander copy remains in typed
TypeScript dictionaries. Catalog text is stored on its source row in locale-keyed `translations` jsonb
columns on Products, Product Assemblies, Product Ranges, and Product Range Variants.

Each translated field is an independent envelope containing `value`, `sourceHash`, `translatedAt`, and
`isManual`. The source hash is computed from that field's current Canonical Text, so state is derived per
field rather than stored:

- `fresh`: an envelope exists and its source hash matches Canonical Text;
- `missing`: no envelope exists;
- `stale`: an AI-owned envelope exists but its source hash no longer matches;
- `needsReview`: a manual envelope exists but its source hash no longer matches.

Manual values continue serving while they need review. Saving a manual value stamps the current
per-field source hash and therefore makes it fresh. Reverting a field to AI removes its manual envelope
and immediately schedules its entity for regeneration. Missing fields fall back to Canonical Text;
stale and needs-review values keep serving until replaced or reviewed.

## Considered Options

- **One translation blob per entity.** Rejected because a single source hash makes an unrelated English
  edit stale every translated field and cannot preserve a manual correction independently. Per-field
  envelopes let AI and staff own different fields on the same entity.
- **Per-entity tables or a generic `(entity, field, locale)` table.** Rejected because array fields pivot
  poorly, every Lander read gains joins, and translations have one bounded writer. On-row jsonb mirrors
  the source shape and travels with existing catalog reads.
- **Treat manual drift as stale.** Rejected because recovery would repeatedly send a field to AI that AI
  is forbidden to overwrite. `needsReview` is disjoint from `stale`, visible in translation status, and
  excluded from the scheduler, runner, backfill, and stale-recovery procedure.
- **Let the AI result overwrite the row loaded before its model call.** Rejected because catalog or manual
  edits can land during a slow model request. Persistence locks and rereads the current rows inside its
  transaction, verifies per-field source hashes, and skips every currently manual field.
- **Message broker or DB-backed queue.** Rejected for the current low-volume, single-replica workload.
  The in-process scheduler provides per-entity debounce, single-flight execution, and eager recovery.
  Lost scheduling state does not lose truth because missing/stale state remains derivable. Multiple API
  replicas would require a DB claim or Postgres-backed queue.
- **Human approval before any AI translation serves.** Rejected because an approval backlog would cause
  persistent English fallbacks. AI translations serve immediately; staff can take ownership of specific
  fields when corrections matter.

## Consequences

- The Product translation unit includes Product fields and Assembly names in one model request; Ranges
  and Variants are separate units. Model Code is never translated.
- AI recovery acts only on entities whose aggregate state contains `missing` or `stale`. Those queueable
  states take precedence over `needsReview` for a mixed entity so its AI-owned fields can still heal,
  while persistence preserves its manual fields.
- The catalog-translations tRPC router exposes Product, Range, and Variant get/update contracts. Get
  returns Canonical Text, stored envelopes, and derived per-field states. Product responses include
  Assemblies. Product access requires `product:update`; Range and Variant access requires
  `product_range:update`.
- Translation-only writes bypass normal catalog mutation procedures, so they never masquerade as an
  English edit. Only revert-to-AI uses the scheduler's immediate path.
- Slugs, URL parameters, and uniqueness continue deriving from Canonical Text. The Lander remains
  read-only under ADR 0007, and brochure localization uses the same stored envelopes.

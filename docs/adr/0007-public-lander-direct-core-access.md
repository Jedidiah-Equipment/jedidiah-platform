# Public Landers Read Their Environment Directly

The public marketing Lander (`@pkg/lander`, TanStack Start with SSR) renders catalog data by calling
`@pkg/core` read services against its own database connection and S3 `StorageAdapter`, rather than
calling the authenticated API. This keeps the public surface read-only and avoids adding unauthenticated
variants of API routes whose normal contract is session-gated.

## Considered Options

- **Call the existing `@pkg/api`.** Rejected: product/range/image routes are behind Better Auth session
  checks, and adding public variants would expand the API's unauthenticated surface.
- **Stand up a separate public read API.** Rejected: duplicates `@pkg/core` reads behind a new transport
  for one consumer.
- **Read `@pkg/core` directly from the Lander server (chosen).** The Lander owns a lazy DB client and S3
  adapter, then calls the same core read services the app API uses.

## Consequences

- Both staging and production landers exist. The staging lander reads the staging DB/bucket and serves a
  staging subdomain; the production lander reads the production DB/bucket and serves the apex/`www`.
- Each Lander requires runtime config for its own environment: `DATABASE_URL` and `DOCUMENT_STORAGE_*`
  must point at the same environment's Postgres and bucket used by that environment's API.
- The Lander remains read-only and must not run migrations. API deployment owns schema migration for each
  environment.
- The Lander serves images through public cache-friendly routes that stream source bytes from object
  storage through existing product/range image services, and brochure PDFs through
  `generateProductBrochureIfComplete`.
- Image optimization stays local to `@pkg/lander`: it downscales raster images to a 1280px-wide WebP
  variant, caches by immutable storage key plus transform signature, and falls back to streaming the
  original bytes if optimization fails. The cache directory remains ephemeral on Railway for now.
- A future Railway Volume for the Lander image cache remains deferred until cache re-warm cost justifies
  the added infrastructure.
- The contact form sends lead email via Resend directly from a Lander server route because `@pkg/api`'s
  email sender is coupled to API config and its fixed `EmailType` set.

# Public Lander Reads Core/DB/S3 Directly

The public marketing **Lander** (`@pkg/lander`, TanStack Start with SSR) renders the live catalog by calling `@pkg/core` read services against its own database connection and S3 `StorageAdapter`, rather than calling the existing authenticated API. We chose this because the Lander is a read-only, unauthenticated surface that needs the same domain reads the app already owns, and routing it through the auth-gated API (or building a parallel public API) would add a network hop and an auth-bypass path for no benefit.

## Considered Options

- **Call the existing `@pkg/api`.** Rejected: every product/range/image route is behind Better Auth session checks; exposing public variants means a second, unauthenticated entry into the app API and its surface area.
- **Stand up a separate public read API.** Rejected: duplicates `@pkg/core` reads behind a new transport for a single consumer; more infra, more drift.
- **Read `@pkg/core` directly from the Lander server (chosen).** The Lander owns a lazy DB client (`createDatabaseClient`) and an S3 `StorageAdapter`, and SSR loaders call core reads (`listProductRanges`, product reads, `generateProductBrochureIfComplete`) the same way the API does.

## Consequences

- The Lander needs its own runtime config — `DATABASE_URL` and S3 credentials pointing at the **same environment's** Postgres and bucket the API uses. It is read-only and must **not** run migrations (the API owns schema migration).
- The Lander serves images itself via public, cache-friendly server routes that stream bytes from S3 through the existing `readProductRangeImage` / `readProductBrochureImage` services; brochure PDFs download through `generateProductBrochureIfComplete`.
- The contact form sends lead email via **Resend** called directly from a Lander server route, since `@pkg/api`'s email sender is coupled to API config and its fixed `EmailType` set.
- Staging-only for now: the Lander reads the **staging** DB/bucket. At production launch the staging Lander is dropped and a production Lander service reads production.

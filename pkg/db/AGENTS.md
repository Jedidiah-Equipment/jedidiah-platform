# db (@pkg/db)

- Commit generated SQL migrations.
- Do not use `drizzle-kit push` for production-style changes.
- Keep schema definitions declarative when constraints can express the invariant.

Canonical examples: `src/schema/product.ts`, `src/database-client.ts`, `src/query-utils.ts`.

# schema (@pkg/schema)

## Copy These

- Product schemas: `src/products/product.ts`
- Pagination schemas: `src/common/pagination.ts`
- Auth IDs: `src/auth/auth-id.ts`
- Authorization schemas: `src/auth/authorization.ts`
- Public exports: `src/index.ts`

## Notes

- Keep this package lightweight and framework-independent.
- Do not depend on React, Fastify, Drizzle, Better Auth handlers, or direct `process.env`.

## Validation ownership

This package is the single source of truth for field-level validation. Consumers must not
re-declare constraints (`.min`, `.email`, `.regex`, branded scalars) that a schema export
already owns. Organise schemas in two tiers:

- **Leaf scalars** — branded field rules (`Price`, `UUID`, `CustomerCompanyName`,
  `QuoteNotes`). Define the constraint once here; everything else composes them.
- **Entity + API I/O** — domain and request shapes (`Quote`, `QuoteCreateInput`). The
  server contract.

Browser-specific representations (empty string for null, etc.) are web's concern and do not
belong here — web derives them from these scalars. Keep this package free of form/UI shape.

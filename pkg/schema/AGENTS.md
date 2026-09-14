# schema (@pkg/schema)

- Keep this package lightweight and framework-independent.
- Do not depend on React, Fastify, Drizzle, Better Auth handlers, or direct `process.env`.
- Own field-level validation here. Consumers must not re-declare constraints that a schema export already owns.
- Use leaf scalars for branded field rules and compose them into entity/API I/O schemas.
- Browser form representations, such as empty strings for nullable fields, belong in `@pkg/web`.
- Business shapes live under `src/equipment/` and ship from `@pkg/schema/equipment`; the root exports only shared scalars, auth, audit, changelog, environment and user-account shapes (`src/users/`, the sign-in account and its two role slots, which both businesses' user admin reads). A shape that names a business entity — Department Membership included — is a business shape.

Canonical examples: `src/equipment/products/product.ts`, `src/common/pagination.ts`, `src/auth/authorization.ts`.

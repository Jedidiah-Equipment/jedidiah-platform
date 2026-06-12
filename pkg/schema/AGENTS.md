# schema (@pkg/schema)

- Keep this package lightweight and framework-independent.
- Do not depend on React, Fastify, Drizzle, Better Auth handlers, or direct `process.env`.
- Own field-level validation here. Consumers must not re-declare constraints that a schema export already owns.
- Use leaf scalars for branded field rules and compose them into entity/API I/O schemas.
- Browser form representations, such as empty strings for nullable fields, belong in `@pkg/web`.

Canonical examples: `src/products/product.ts`, `src/common/pagination.ts`, `src/auth/authorization.ts`.

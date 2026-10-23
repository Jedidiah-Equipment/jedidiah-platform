# schema (@pkg/schema)

- Keep this package lightweight and framework-independent.
- Do not depend on React, Fastify, Drizzle, Better Auth handlers, or direct `process.env`.
- Own field-level validation here. Consumers must not re-declare constraints that a schema export already owns.
- Use leaf scalars for branded field rules and compose them into entity/API I/O schemas.
- A form's value representation, such as empty strings for unpicked or nullable fields, belongs to the app that
  renders it. When `@pkg/web` and `@pkg/mobile` render the same form, its value schema and the mapper to its API
  input live here beside that input instead (`src/contracting/jobs/job-create-form.ts`), so both surfaces validate
  from one definition. Compose those from the shared form-field helpers in `src/common/form.ts`.
- Business shapes live under `src/equipment/` and ship from `@pkg/schema/equipment`; the root exports only shared scalars, auth, audit, changelog, push, transcription, environment and user-account shapes (`src/users/`, the sign-in account and its two role slots, which both businesses' user admin reads). A shape that names a business entity — Department Membership included — is a business shape.

Canonical examples: `src/equipment/products/product.ts`, `src/common/pagination.ts`, `src/auth/authorization.ts`.

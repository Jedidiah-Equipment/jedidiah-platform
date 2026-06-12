# domain (@pkg/domain)

- Keep this package lightweight, pure, and browser-safe.
- This package may depend on `@pkg/schema`.
- Do not depend on React, Fastify, Drizzle, Better Auth handlers, database clients, or direct `process.env`.
- Put shared policy, formatting, demo-user facts, and pure helpers here. Keep Zod schemas in `@pkg/schema`.

Canonical examples: `src/auth/authorization.ts`, `src/demo.ts`, `src/index.ts`.

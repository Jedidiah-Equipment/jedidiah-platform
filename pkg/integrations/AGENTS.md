# integrations (@pkg/integrations)

- Own the clients and services that talk to third-party systems on a business's behalf. Business-blind code
  lives at the package root and ships from `@pkg/integrations`; each business's integrations live under
  `src/<business>/` and ship from `@pkg/integrations/<business>`. John Deere Operations Center is Contracting's,
  under `src/contracting/john-deere/`.
- Keep HTTP transport, Fastify request parsing, env/config reads, and runtime wiring in `@pkg/api`.
- Do not import Fastify, `@pkg/api`, API `@/` modules, `getApiConfig`, or direct `process.env` from `src`. The API
  injects config, the database, the logger, `fetch` and the clock.
- A third-party failure surfaces as the integration's one error class with a code union (`JohnDeereError`), per
  `pkg/core/AGENTS.md`; the API maps it through an error family like any core error.
- Tests stub `fetch` at the client boundary and run the services against a cloned test database; no test reaches
  the real service.

Canonical examples: `src/contracting/john-deere/client.ts`, `src/contracting/john-deere/connection-service.ts`.

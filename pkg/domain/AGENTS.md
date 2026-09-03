# domain (@pkg/domain)

- Keep this package lightweight, pure, and browser-safe.
- This package may depend on `@pkg/schema`.
- Do not depend on React, Fastify, Drizzle, Better Auth handlers, database clients, or direct `process.env`.
- Put shared policy, formatting, demo-user facts, and pure helpers here. Keep Zod schemas in `@pkg/schema`.
- Shared palettes here are Tailwind class strings (`src/theme/status-badge.ts`), so both apps must scan
  this package for them: `@source` in `pkg/web/src/styles/globals.css`, `content` in
  `pkg/mobile/tailwind.config.js`. A class neither scans still renders — it just paints nothing, and no
  test catches that. Tailwind emits a rule per candidate it scans, so `dark:text-blue-200` yields only
  the `.dark`-scoped rule: a scheme half native names must be authored as its own bare literal
  (`textByScheme`), never sliced off the two-tone class at runtime — `pkg/mobile`'s
  `scheme-half-contract` test compiles the stylesheet and checks every half against it. Prefer reusing
  an existing palette entry over introducing a new colour.

Canonical examples: `src/auth/authorization.ts`, `src/equipment/demo.ts`, `src/index.ts`.

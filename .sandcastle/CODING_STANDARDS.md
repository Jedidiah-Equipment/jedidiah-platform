# Coding Standards

<!-- Customize this file with your project's coding standards.
     The reviewer agent loads it during code review via @.sandcastle/CODING_STANDARDS.md
     so these standards are enforced during review without costing tokens during implementation. -->

## Style

- Prefer the existing local pattern over a new abstraction.
- Use dash-case for folders and non-component files. Use PascalCase for React component files.
- Prefer named exports.
- Keep public boundaries explicitly typed: exports, props, router inputs, database helpers, and
  package APIs.
- Use package aliases (`@pkg/*`) and local aliases (`@/*` in web) instead of deep cross-package
  relative imports.
- For Zod schemas, use same-name PascalCase type/value pairs, put the type first, and do not use a
  `Schema` suffix.

## Testing

- Add tests next to the behavior they cover.
- Test the layer under change directly; do not route through unrelated transports or UI.
- For tRPC procedures, use direct caller tests unless the HTTP transport itself is the behavior.
- Add schema tests when validation, coercion, defaults, or branding are non-obvious.
- Do not use browser tests unless explicitly asked.

## Architecture

- Keep API routers thin: validate input, call domain/service code, and map expected errors.
- Keep app-owned business logic out of Fastify, tRPC wiring, and React components.
- Use Zod at package, API, URL, form, env, and runtime-config boundaries.
- Keep runtime env reads in env modules or central test helpers.
- Shared schemas belong in `@pkg/schema`; page/package-local schemas belong close to use.
- Domain table components own TanStack table setup; shared table components render configured
  tables.
- Use local persisted table state by default.

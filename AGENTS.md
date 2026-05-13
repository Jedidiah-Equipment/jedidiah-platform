# AGENTS.md

High-level guidance for coding agents in this repo. Package-specific rules live in each
`pkg/*/AGENTS.md`; read the closest one before changing files in that package.

## Project

- This is a pnpm workspace monorepo on Node.js 24.x.
- `docs/application-stack-and-hosting.md` is the architecture map for stack, package boundaries,
  runtime config, and hosting direction.
- `docs/authorization-architecture.md` is the authoritative description of the role/permission
  model that spans `@pkg/schema`, `@pkg/core`, the Better Auth admin plugin, and the web app.
- Current packages are `@pkg/api`, `@pkg/web`, `@pkg/schema`, `@pkg/core`, and `@pkg/db`.
- Do not add CI, deployment, or production infrastructure files unless the task explicitly asks for
  that slice.

## Tooling

- Use pnpm for package operations and scripts.
- Use Biome for linting and formatting.
- Use Vitest for tests.
- Turborepo runs workspace scripts from the root.
- Keep root scripts scoped to packages that exist.

## Coding Style Guide

- Prefer the existing local pattern over a new abstraction. Good reference files are
  `pkg/api/src/routes/products/products.router.ts`, `pkg/core/src/products/product-service.ts`,
  `pkg/schema/src/products/product.ts`, and `pkg/web/src/pages/products/ProductsPage.tsx`.
- Use dash-case for folder and non-component file names. React component files use PascalCase.
- Keep TypeScript strict and explicit at boundaries: exported functions, public package exports,
  router inputs, database helpers, and React props should have clear types.
- Use Zod for runtime validation and derived types where data crosses package, API, URL, form, or
  env boundaries.
- Keep runtime env reads in package env modules or central test helpers; do not scatter
  `process.env` through feature code.
- Keep imports on package aliases (`@pkg/*`) or local aliases (`@/*` in `pkg/web`) instead of deep
  cross-package relative paths.
- Add tests next to the behavior they cover, and keep them focused on the layer under test.

## Verification

For normal changes, run:

```sh
pnpm typecheck
pnpm lint
pnpm test
```

For DB schema or migration changes, also run:

```sh
pnpm db:up
pnpm db:migrate
pnpm db:up:template
```

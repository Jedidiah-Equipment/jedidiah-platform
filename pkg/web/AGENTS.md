# app (@pkg/web)

Guidance for the React/Vite app. The best references are `src/pages/products/ProductsPage.tsx`,
`src/pages/products/components/ProductTable.tsx`, `src/components/data-table/DataTable.tsx`, and
`src/components/form/use-app-form.ts`.

## Ownership

- Owns React/Vite app setup, TanStack Router routes, TanStack Query, tRPC client wiring, Better Auth
  React client usage, `/env.js` runtime config, local shadcn/ui components, and the static server.
- Public browser config comes from `window.__APP_CONFIG__` via `/env.js`; do not use `VITE_*` for
  deploy-time URLs.
- Login is email/password only for now. Do not add register, forgot password, password reset, or
  email verification UI unless requested.

## Source Layout

- `src/routes` contains thin TanStack route files: route wiring, search validation, guards, loaders,
  redirects, and `staticData`.
- `src/pages/{page-name}/{PageName}Page.tsx` contains page composition and feature-level UI.
- `src/pages/{page-name}/components/*` contains page-only components.
- `src/pages/{page-name}/types.ts` contains page-owned Zod values and inferred types.
- `src/components/ui/*` contains local shadcn/ui primitives.
- `src/components/form/*` contains shared TanStack Form and field wrappers.
- `src/components/{component-name}/{ComponentName}.tsx` contains reusable app components.
- `src/hooks`, `src/lib`, `src/app`, `src/providers`, and `src/server` keep the same split already
  visible in the tree.

## React Coding Style Guide

- Keep route files thin; put real UI in page components.
- Prefer named component exports. Keep props types immediately above the component that consumes
  them.
- For TSX files, use this order: imports, exported component, internal components, then pure helpers.
- Keep component state local unless it is server/cache state, shareable URL state, or shared
  client-only state.
- Use TanStack Query for server/cache state.
- Use TanStack Router search params for shareable state such as filters, sorting, pagination, tabs,
  and selected views.
- Use Zustand only for shared client-only state that does not belong in the URL or server cache.
  When reading multiple store values/actions, use one selector wrapped with `useShallow`.
- Keep TSX files near 200 lines. Around 250 lines, split page-local components, hooks, or helpers
  unless the file is mostly declarative or generated.

## UI And Forms

- Use existing local shadcn/ui components from `src/components/ui` before custom controls. Check
  `components.json` before adding or updating shadcn components.
- The project uses Base UI, Tailwind CSS 4, style `base-nova`, and lucide icons.
- Use semantic theme tokens and Tailwind layout utilities. Prefer `gap-*` over `space-*`, `size-*`
  over paired width/height, and `cn()` for conditional classes.
- Use lucide icons in icon-capable buttons. Inside buttons, mark icons with `data-icon` and let the
  button styles size them.
- Use TanStack Form with Zod. Reuse `src/components/form` wrappers for normal field wiring.
- Standard forms should use `FieldGroup`, `Field`, and the existing field components instead of raw
  div stacks.
- Use `sonner` for toast feedback, `Skeleton` for loading placeholders, `Badge` for badges, and
  `Separator` instead of custom border dividers.

## Data Access

- Use `useTRPC()` with `@trpc/tanstack-react-query`: `queryOptions`, `mutationOptions`,
  `queryFilter`, and typed query keys/filters.
- Do not introduce new classic `@trpc/react-query` hook usage.
- Keep table state patterns aligned with `src/pages/products/components/ProductTable.tsx` and
  `src/components/data-table/store.ts`.

## Verification

- Run `pnpm --filter @pkg/web typecheck` for web type changes.
- Run `pnpm --filter @pkg/web test` for web tests.
- Run root `pnpm lint` for Biome formatting and linting.

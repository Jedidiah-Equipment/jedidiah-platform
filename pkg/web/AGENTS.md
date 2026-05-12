# app (@pkg/web)

Guidance for agents working in the React/Vite app.

## UI System

- The app uses local shadcn/ui components generated for Base UI and Tailwind CSS 4.
- Prefer existing components from `src/components/ui` before creating custom controls.
- Use `src/components/form` wrappers for common TanStack Form field wiring.
- Use lucide icons in buttons when a matching icon exists.
- Keep styling lean with Tailwind classes and semantic theme tokens.
- Check `components.json` before adding or updating shadcn components.

## Source Layout

- `src/app` contains app bootstrap and composition code, such as providers, router creation, and the
  generated route tree.
- `src/routes` contains thin TanStack route files. Keep route wiring, guards, loaders, and route-level
  redirects here, then reference page components for UI.
- `src/pages/{page-name}/{PageName}Page.tsx` contains page components.
- `src/pages/{page-name}/components/*` contains components used only by that page.
- `src/pages/{page-name}/types.ts` contains page-owned Zod values and inferred types.
- `src/components/ui/*` contains local shadcn/ui primitives.
- `src/components/form/*` contains shared TanStack Form + shadcn field wrappers.
- `src/components/{component-name}/{ComponentName}.tsx` contains React components shared by multiple
  pages.
- `src/hooks` contains shared hooks.
- `src/lib` contains runtime integration modules such as app config, auth client, tRPC, query client,
  and utility functions.
- `src/server` contains the production static server and server-side env parsing for `/env.js`.

## File Size

- Keep TSX files near 200 lines or less.
- Treat 250 lines as the review threshold: extract page-local UI into
  `src/pages/{page-name}/components/*`, move reusable code to shared component folders, or split
  pure helpers/hooks into their own files before adding more behavior.
- A file may exceed the threshold only when it is mostly declarative static content or generated.
  Note why the larger file is clearer in the PR or handoff.

## TSX File Layout

Prefer this TSX file order:

```tsx
// imports

type Props = {};

export function PrimaryComponentName(props: Props) {
  return null;
}

type InternalComponentProps = {};

function InternalComponent(props: InternalComponentProps) {
  return null;
}

function internalFunction() {}
```

Keep each internal component's props immediately above that component. Put non-component helper
functions after internal components.

## Hooks

- Hook files should contain one hook, and the file name should match that hook name.
- Hooks should live in a `hooks/` folder placed at the nearest shared level where every hook consumer
  is in that folder or below it.
- Use React local state for component-only UI state.
- Use Zustand only for shared client-only state that does not belong in the URL or server cache.
- When selecting multiple Zustand values/actions in one component or hook, use one selector wrapped
  with `useShallow` from `zustand/react/shallow`.

## Forms

- Use TanStack Form for browser form state and validation.
- Reuse shared form wrappers such as `TextField` and `PasswordField` from `src/components/form` for
  standard field/input/error wiring.
- Keep schema definitions near the page or feature that owns the form unless the schema is reused
  across multiple features.
- Use same-name Zod type/value pairs in `types.ts`: define
  `export type LoginForm = z.infer<typeof LoginForm>;` before
  `export const LoginForm = z.object(...)`, with no `Schema` suffix.

## Data And Routing

- Use TanStack Query for all server/cache state.
- For tRPC calls, use the TanStack-native `@trpc/tanstack-react-query` pattern:
  `useQuery(trpc.someProcedure.queryOptions(input))`,
  `useMutation(trpc.someProcedure.mutationOptions(options))`, and typed query filters/keys with
  `useQueryClient()` for cache operations. Do not add new `@trpc/react-query` classic hook usage.
- Use TanStack Router search params for shareable URL state such as table filters, sorting,
  pagination, selected tabs, and selected views.
- Keep route files thin; page components own presentation and feature composition.
- `/dashboard` and `/products` are authenticated routes.
- Do not add register, forgot password, password reset, or email verification UI until requested.

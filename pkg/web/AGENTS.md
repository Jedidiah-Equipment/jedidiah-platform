# app (@pkg/web)

## Shadcn

- app uses shadcn, we have skill and mcp
- always default to using shadcn components, last resort is custom component

## Source Layout

- `src/app` contains app bootstrap and composition code, such as providers and router creation.
- `src/routes` contains thin TanStack route files. Keep route wiring, guards, loaders, and route-level
  redirects here, then reference page components for UI.
- `src/pages/{page-name}/{PageName}Page.tsx` contains page components.
- `src/pages/{page-name}/components/*` contains components used only by that page.
- `src/pages/{page-name}/types.ts` contains component-related Zod values and inferred types.
- `src/components/form/*` contains shared TanStack Form + shadcn field wrappers. Prefer these for
  common controls before wiring `form.Field`, `Field`, `Input`, and `FieldError` directly in pages.
- `src/components/{component-name}/{ComponentName}.tsx` contains React components shared by multiple
  pages.
- `src/utils/{util-name}.ts` contains common non-TSX utilities.
- Keep runtime integration modules such as app config, tRPC, query client, and env parsing under
  `src/lib`.

## File Size

- Keep TSX files near 200 lines or less.
- Treat 250 lines as the review threshold: extract page-local UI into
  `src/pages/{page-name}/components/*`, move reusable code to shared component folders, or split
  pure helpers/hooks into their own files before adding more behavior.
- A file may exceed the threshold only when it is mostly declarative static content or a generated
  artifact. Leave a short comment in the PR explaining why the larger file is clearer.

## TSX File Layout

Prefer this TSX file order:

```tsx
// imports

type Props = {};

export function PrimaryComponentName = (props: Props) => {
  return null;
};

type InternalComponentProps = {};

function InternalComponent = (props: InternalComponentProps) => {
  return null;
};

type InternalComponent2Props = {};

function InternalComponent2 = (props: InternalComponent2Props) => {
  return null;
};

function internalFunction () {};
```

Keep each internal component's props immediately above that component. Put non-component helper
functions after the internal components.

## Hooks

- Hook files should contain only one hook, and the file name should match that hook name.
- Hooks should live in a `hooks/` folder placed at the nearest shared level where every hook consumer
  is in that folder or below it.

## Forms

- Use TanStack Form for browser form state and validation.
- Reuse shared form wrappers such as `TextField` and `PasswordField` from `src/components/form` for
  standard shadcn field/input/error wiring.
- Keep schema definitions near the page or feature that owns the form unless the schema is reused
  across multiple features.
- Use same-name Zod type/value pairs in `types.ts`: define `export type LoginForm =
  z.infer<typeof LoginForm>;` before `export const LoginForm = z.object(...)`, with no `Schema`
  suffix.

# app (@app/web)

## Source Layout

- `src/app` contains app bootstrap and composition code, such as providers and router creation.
- `src/routes` contains thin TanStack route files. Keep route wiring, guards, loaders, and route-level
  redirects here, then reference page components for UI.
- `src/pages/{page-name}/{PageName}Page.tsx` contains page components.
- `src/pages/{page-name}/components/*` contains components used only by that page.
- `src/pages/{page-name}/types.ts` contains components related zod types.
- `src/components/{component-name}/{ComponentName}.tsx` contains React components shared by multiple
  pages.
- `src/utils/{util-name}.ts` contains common non-TSX utilities.
- Keep runtime integration modules such as app config, tRPC, query client, and env parsing under
  `src/lib`.

## TSX File Layout

Prefer this TSX file order:

```tsx
// imports

type Props = {};

export const PrimaryComponentName: React.FC<Props> = () => {
  return null;
};

type InternalComponentProps = {};

const InternalComponent: React.FC<InternalComponentProps> = () => {
  return null;
};

type InternalComponent2Props = {};

const InternalComponent2: React.FC<InternalComponent2Props> = () => {
  return null;
};

const internalFunction = () => null;
```

Keep each internal component's props immediately above that component. Put non-component helper
functions after the internal components.

## Hooks

- Hook files should contain only one hook, and the file name should match that hook name.
- Hooks should live in a `hooks/` folder placed at the nearest shared level where every hook consumer
  is in that folder or below it.

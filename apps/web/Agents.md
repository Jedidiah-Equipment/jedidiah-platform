# app (@app/web)

## TSX file layout

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

Keep each internal component's props immediately above that component. Put non-component helper functions after the internal components.
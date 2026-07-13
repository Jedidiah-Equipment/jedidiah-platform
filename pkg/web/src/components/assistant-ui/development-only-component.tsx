import { type FC, Suspense } from 'react';

export function createDevelopmentOnlyComponent(Component: FC | null): FC {
  return function DevelopmentOnlyComponent() {
    if (!Component) {
      return null;
    }

    return (
      <Suspense fallback={null}>
        <Component />
      </Suspense>
    );
  };
}

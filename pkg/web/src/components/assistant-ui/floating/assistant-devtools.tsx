import { type FC, lazy, Suspense } from 'react';

// Assistant-ui devtools, mounted in development only. `import.meta.env.DEV` is a compile-time constant,
// so Vite replaces it with `false` in production and dead-code-eliminates the dynamic import below —
// the devtools chunk never enters the production bundle.
const DevToolsModal: FC | null = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('@assistant-ui/react-devtools')).DevToolsModal }))
  : null;

export const AssistantDevtools: FC = () => {
  if (!DevToolsModal) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DevToolsModal />
    </Suspense>
  );
};

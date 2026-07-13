import { type FC, lazy, Suspense } from 'react';

const LazyFloatingAssistant = lazy(async () => ({
  default: (await import('./floating-assistant-runtime.js')).FloatingAssistantRuntime,
}));

export const FloatingAssistant: FC = () => (
  <Suspense fallback={null}>
    <LazyFloatingAssistant />
  </Suspense>
);

import { type FC, lazy, Suspense } from 'react';

const LazySidebarAssistant = lazy(async () => ({
  default: (await import('./sidebar-assistant-runtime.js')).SidebarAssistantRuntime,
}));

export const SidebarAssistant: FC<{ enabled: boolean }> = ({ enabled }) => {
  if (!enabled) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazySidebarAssistant />
    </Suspense>
  );
};

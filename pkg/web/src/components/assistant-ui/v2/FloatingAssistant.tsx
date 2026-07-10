import { type FC, lazy } from 'react';

import { createDevelopmentOnlyComponent } from './development-only-component.js';

// The v2 assistant is development-only while its model and tool surface are being validated.
// Matching AssistantDevtools, the compile-time DEV branch lets Vite remove the dynamic import and
// keeps the full assistant runtime out of staging and production bundles.
const DevelopmentFloatingAssistant: FC | null = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('./floating-assistant-runtime.js')).FloatingAssistantRuntime }))
  : null;

export const FloatingAssistant = createDevelopmentOnlyComponent(DevelopmentFloatingAssistant);

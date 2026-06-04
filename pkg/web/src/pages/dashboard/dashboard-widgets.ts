import type { DashboardWidget } from './dashboard-widget-types.js';
import { WelcomeAccessWidget } from './WelcomeAccessWidget.js';

export const dashboardWidgets = [
  {
    Component: WelcomeAccessWidget,
    id: 'welcome-access',
    size: 'lg',
    title: 'Welcome',
  },
] as const satisfies readonly DashboardWidget[];

import { hasPermission } from '@pkg/domain';
import type { AppPermission, UserAccessSummary } from '@pkg/schema';
import type React from 'react';

export type DashboardWidgetSize = 'sm' | 'md' | 'lg';

export type DashboardWidget = {
  id: string;
  title: string;
  requires?: AppPermission;
  size: DashboardWidgetSize;
  Component: React.ComponentType;
};

export function filterDashboardWidgets(
  access: Pick<UserAccessSummary, 'permissions'> | null | undefined,
  widgets: readonly DashboardWidget[],
): DashboardWidget[] {
  return widgets.filter((widget) => !widget.requires || hasPermission(access, widget.requires));
}

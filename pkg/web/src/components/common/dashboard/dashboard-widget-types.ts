import { hasPermission } from '@pkg/domain';
import type { AppPermission, UserAccessSummary } from '@pkg/schema';
import type React from 'react';

export type DashboardWidgetSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type DashboardWidget = {
  id: string;
  title: string;
  /** Any one of these shows the widget. */
  requires?: AppPermission | readonly AppPermission[];
  size: DashboardWidgetSize;
  Component: React.ComponentType;
};

export function filterDashboardWidgets(
  access: Pick<UserAccessSummary, 'permissions'> | null | undefined,
  widgets: readonly DashboardWidget[],
): DashboardWidget[] {
  return widgets.filter(
    ({ requires }) =>
      !requires ||
      (typeof requires === 'string' ? [requires] : requires).some((permission) => hasPermission(access, permission)),
  );
}

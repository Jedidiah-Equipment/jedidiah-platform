import { hasPermission } from '@pkg/domain';
import type { AppPermission, UserAccessSummary } from '@pkg/schema';
import type React from 'react';

export type DashboardWidgetSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type DashboardWidget = {
  id: string;
  title: string;
  /** The permission, or the access rule, that reads what the widget shows. */
  requires?: AppPermission | ((access: Pick<UserAccessSummary, 'permissions'> | null | undefined) => boolean);
  size: DashboardWidgetSize;
  Component: React.ComponentType;
};

export function filterDashboardWidgets(
  access: Pick<UserAccessSummary, 'permissions'> | null | undefined,
  widgets: readonly DashboardWidget[],
): DashboardWidget[] {
  return widgets.filter(
    ({ requires }) => !requires || (typeof requires === 'string' ? hasPermission(access, requires) : requires(access)),
  );
}

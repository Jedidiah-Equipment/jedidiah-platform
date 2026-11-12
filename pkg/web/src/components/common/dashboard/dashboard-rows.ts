import type { UserAccessSummary } from '@pkg/schema';
import { type DashboardWidget, type DashboardWidgetSize, filterDashboardWidgets } from './dashboard-widget-types.js';

/** Each row starts a new line of the grid, so a role missing a widget never pulls the next row up into its gap. */
export type DashboardRows = readonly (readonly DashboardWidget[])[];

export const visibleDashboardRows = (
  access: Pick<UserAccessSummary, 'permissions'> | null | undefined,
  rows: DashboardRows,
) => rows.map((row) => filterDashboardWidgets(access, row)).filter((row) => row.length > 0);

/** Each size's share of a row, in the proportions of its twelve-column span (an `xs` tile is a quarter, `md` a half). */
const sizeWeights = { xs: 1, sm: 4 / 3, md: 2, lg: 8 / 3, xl: 4 } as const satisfies Record<
  DashboardWidgetSize,
  number
>;

/** The row's column tracks from the widgets the role sees, so the row fills the width whichever of them are missing. */
export const dashboardRowColumns = (row: readonly Pick<DashboardWidget, 'size'>[]) =>
  row.map((widget) => `minmax(0, ${sizeWeights[widget.size]}fr)`).join(' ');

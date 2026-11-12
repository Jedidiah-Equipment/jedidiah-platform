import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/components/common/dashboard/dashboard-refresh.js';
import { HoursHeatMap } from '@/contracting/components/hours-heat-map/HoursHeatMap.js';

export function DailyHoursWidget() {
  return <HoursHeatMap refetchInterval={DASHBOARD_REFETCH_INTERVAL_MS} />;
}

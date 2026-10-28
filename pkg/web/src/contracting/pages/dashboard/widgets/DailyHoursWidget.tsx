import { HoursHeatMap } from '@/contracting/components/hours-heat-map/HoursHeatMap.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/lib/dashboard-refresh.js';

export function DailyHoursWidget() {
  return <HoursHeatMap refetchInterval={DASHBOARD_REFETCH_INTERVAL_MS} />;
}

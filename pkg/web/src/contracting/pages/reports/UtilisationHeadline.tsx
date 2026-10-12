import { formatNumber, formatPercent } from '@pkg/domain';
import type { FleetUtilisation } from '@pkg/schema/contracting';
import { StatCard } from '@/components/common/StatCard.js';
import { Card, CardContent } from '@/components/ui/card.js';

const percent = (value: number | null) => (value === null ? '—' : formatPercent(value));

/** Fleet Load and fleet Utilisation % for the window; the target sits beside the one it is drawn on. */
export function UtilisationHeadline({ fleet, target }: { fleet: FleetUtilisation; target: number | null }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 sm:flex-row">
        <StatCard
          label="Fleet Load"
          value={percent(fleet.fleetLoadPercent)}
          sublabel={`${formatNumber(fleet.activeMachineCount)} of ${formatNumber(fleet.machineCount)} machines worked`}
        />
        <StatCard
          label="Utilisation"
          value={percent(fleet.utilisationPercent)}
          sublabel={`${formatNumber(fleet.activeDays)} active days of ${formatNumber(fleet.fleetDays)}${
            target === null ? '' : ` · target ${formatPercent(target)}`
          }`}
        />
      </CardContent>
    </Card>
  );
}

import { formatNumber, getFirstName } from '@pkg/domain';
import type { JobSummary } from '@pkg/schema/contracting';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

const SHOWN_DRIVERS = 2;

/** The first two on-site Drivers by first name and a count of the rest; hovering lists every one by full name. */
export function OnSiteDrivers({ drivers }: { drivers: JobSummary['onSiteDrivers'] }) {
  if (drivers.length === 0) return null;
  const more = drivers.length - SHOWN_DRIVERS;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="whitespace-nowrap font-medium" />}>
        {drivers
          .slice(0, SHOWN_DRIVERS)
          .map((driver) => getFirstName(driver.name))
          .join(', ')}
        {more > 0 ? <span className="ml-1 text-muted-foreground">+{formatNumber(more)}</span> : null}
      </TooltipTrigger>
      <TooltipContent>
        <ul>
          {drivers.map((driver) => (
            <li key={driver.id}>{driver.name}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

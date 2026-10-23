import { formatHours } from '@pkg/domain';
import {
  hoursToServiceLabel,
  serviceDueNeedsAttention,
  serviceDueStatusColorClassNames,
} from '@pkg/domain/contracting';
import type { Machine, ServiceDueStatus } from '@pkg/schema/contracting';
import { cn } from '@/lib/utils.js';

/** Hours, or a muted dash when there are none. */
export const hoursOrDash = (hours: number | null) =>
  hours === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="tabular-nums">{formatHours(hours)}</span>
  );

export type HoursToService = { hoursToService: number; serviceDueStatus: ServiceDueStatus };

/** What a Machine has left before Next Service Due, or null while it has no reading or no due point. */
export const machineHoursToService = ({
  hoursToService,
  serviceDueStatus,
}: Pick<Machine, 'hoursToService' | 'serviceDueStatus'>): HoursToService | null =>
  hoursToService === null ? null : { hoursToService, serviceDueStatus };

/** The hours to go, in the status colour once the Machine needs attention and muted otherwise. */
export function HoursToServiceLabel({
  hoursToService,
  serviceDueStatus,
  className,
}: HoursToService & { className?: string }) {
  return (
    <span
      className={cn(
        serviceDueNeedsAttention(serviceDueStatus)
          ? serviceDueStatusColorClassNames[serviceDueStatus].text
          : 'text-muted-foreground',
        className,
      )}
    >
      {hoursToServiceLabel(hoursToService)}
    </span>
  );
}

/** Next Service Due with the hours to go beneath it, as the Machines list and the Services table show it. */
export function NextServiceDue({ hours, toGo }: { hours: number | null; toGo: HoursToService | null }) {
  if (hours === null) return <span className="text-muted-foreground">Not set</span>;
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{formatHours(hours)}</span>
      {toGo ? <HoursToServiceLabel {...toGo} className="text-xs" /> : null}
    </span>
  );
}

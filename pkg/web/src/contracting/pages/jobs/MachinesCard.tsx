import { formatNumber } from '@pkg/domain';
import { groupStints } from '@pkg/domain/contracting';
import type { Assignment, JobDetail } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useTRPC } from '@/lib/trpc.js';
import { ArrivalCaptureDialog } from './ArrivalCaptureDialog.js';
import { DepartureCaptureDialog } from './DepartureCaptureDialog.js';
import { GapResolveDialog } from './GapResolveDialog.js';
import { MachineStintCard, stintNeedsALook } from './MachineStintCard.js';
import { MachinesContext, type SelectedReading, useMachineMutations } from './machines-context.js';
import { PlanMachineDialog } from './PlanMachineDialog.js';
import { ReadingDialog } from './ReadingDialog.js';
import type { JobSheet } from './types.js';

type MachineFilter = 'all' | 'planned' | 'on-site' | 'attention' | 'left' | 'repeat';
const filters: { value: MachineFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'planned', label: 'Planned' },
  { value: 'on-site', label: 'On site' },
  { value: 'attention', label: 'Needs a look' },
  { value: 'left', label: 'Left' },
  { value: 'repeat', label: 'Repeat stint' },
];

export function MachinesCard({ job, sheet }: { job: JobDetail; sheet: JobSheet }) {
  const trpc = useTRPC();
  const planAction = sheet.action('assign');
  const [planning, setPlanning] = useState(false);
  const [reading, setReading] = useState<SelectedReading | null>(null);
  const [arrival, setArrival] = useState<Assignment | null>(null);
  const [gap, setGap] = useState<Assignment | null>(null);
  const [departure, setDeparture] = useState<Assignment | null>(null);
  const [filter, setFilter] = useState<MachineFilter>('all');
  const selectedStint = reading ? job.assignments.find((stint) => stint.id === reading.stint.id) : null;
  const selectedReading =
    reading && selectedStint
      ? {
          stint: selectedStint,
          reading:
            [selectedStint.arrival, selectedStint.departure].find((value) => value?.id === reading.reading.id) ??
            reading.reading,
        }
      : reading;
  const implementOptions = useQuery(
    trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: sheet.can('assign') }),
  );
  const drivers = useQuery(
    trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled: sheet.can('assign') }),
  );
  const mutations = useMachineMutations();
  const stints = useMemo(() => {
    const numbers = new Map<string, number>();
    return groupStints(job.assignments).flatMap((row) => {
      if (row.kind === 'subtotal') return [];
      const stintNumber = (numbers.get(row.stint.machineId) ?? 0) + 1;
      numbers.set(row.stint.machineId, stintNumber);
      return [{ stint: row.stint, stintNumber }];
    });
  }, [job.assignments]);
  const visible = stints.filter(({ stint, stintNumber }) =>
    filter === 'all'
      ? true
      : filter === 'attention'
        ? stintNeedsALook(stint)
        : filter === 'repeat'
          ? stintNumber > 1
          : stint.state === filter,
  );
  const machines = useMemo(
    () => ({
      sheet,
      implementOptions: implementOptions.data ?? [],
      drivers: drivers.data ?? [],
      mutations,
      openReading: setReading,
      openArrival: setArrival,
      openGap: setGap,
      openDeparture: setDeparture,
    }),
    [sheet, implementOptions.data, drivers.data, mutations],
  );
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Machines</CardTitle>
          {planAction ? (
            <CardAction>
              <Button {...planAction} onClick={() => setPlanning(true)}>
                Plan machine
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorMessage
            error={mutations.patch.error ?? mutations.remove.error}
            fallbackMessage="Unable to update Machines."
          />
          <MachinesContext.Provider value={machines}>
            {stints.length ? (
              <>
                <fieldset aria-label="Filter machines" className="flex flex-wrap items-center gap-1">
                  {filters.map(({ value, label }) => (
                    <Button
                      aria-pressed={filter === value}
                      className="h-7 px-2.5"
                      key={value}
                      onClick={() => setFilter(value)}
                      size="sm"
                      type="button"
                      variant={filter === value ? 'secondary' : 'ghost'}
                    >
                      {label}
                    </Button>
                  ))}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatNumber(visible.length)} of {formatNumber(stints.length)}
                  </span>
                </fieldset>
                {visible.length ? (
                  <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2">
                    {visible.map(({ stint, stintNumber }) => (
                      <MachineStintCard key={stint.id} stint={stint} stintNumber={stintNumber} />
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-sm text-muted-foreground">No Machines match this filter.</p>
                )}
              </>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No Machines planned.</p>
            )}
          </MachinesContext.Provider>
        </CardContent>
      </Card>
      <PlanMachineDialog jobId={job.id} open={planning} onOpenChange={setPlanning} />
      <ArrivalCaptureDialog stint={arrival} onClose={() => setArrival(null)} />
      <GapResolveDialog stint={gap} onClose={() => setGap(null)} />
      <DepartureCaptureDialog stint={departure} onClose={() => setDeparture(null)} />
      <ReadingDialog
        selected={selectedReading}
        onClose={() => setReading(null)}
        amendReadings={sheet.can('amendReadings')}
      />
    </>
  );
}

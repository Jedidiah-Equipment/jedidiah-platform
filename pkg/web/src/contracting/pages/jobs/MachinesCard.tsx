import { formatNumber } from '@pkg/domain';
import { groupStints } from '@pkg/domain/contracting';
import type { JobDetail } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useTRPC } from '@/lib/trpc.js';
import { ArrivalCaptureDialog } from './ArrivalCaptureDialog.js';
import { DepartureCaptureDialog } from './DepartureCaptureDialog.js';
import { GapResolveDialog } from './GapResolveDialog.js';
import { MachineStintCard, stintNeedsALook } from './MachineStintCard.js';
import { type MachineDialog, MachinesContext } from './machines-context.js';
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
  const [dialog, setDialog] = useState<MachineDialog | null>(null);
  const [filter, setFilter] = useState<MachineFilter>('all');
  const close = () => setDialog(null);
  const stint =
    dialog && dialog.kind !== 'plan' ? (job.assignments.find((entry) => entry.id === dialog.stintId) ?? null) : null;
  const reading = dialog?.kind === 'reading' ? (stint?.[dialog.role] ?? null) : null;
  const implementOptions = useQuery(
    trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: sheet.can('assign') }),
  );
  const drivers = useQuery(
    trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled: sheet.can('assign') }),
  );
  const stints = useMemo(() => {
    const { machines, planned } = groupStints(job.assignments);
    const numbers = new Map<string, number>();
    return [...machines.flatMap((machine) => machine.stints), ...planned].map((stint) => {
      const stintNumber = (numbers.get(stint.machineId) ?? 0) + 1;
      numbers.set(stint.machineId, stintNumber);
      return { stint, stintNumber };
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
  const machines = {
    sheet,
    implementOptions: implementOptions.data ?? [],
    drivers: drivers.data ?? [],
    open: setDialog,
  };
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Machines</CardTitle>
          {planAction ? (
            <CardAction>
              <Button {...planAction} onClick={() => setDialog({ kind: 'plan' })}>
                Plan machine
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
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
      <PlanMachineDialog
        jobId={job.id}
        open={dialog?.kind === 'plan'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      />
      <ArrivalCaptureDialog stint={dialog?.kind === 'arrival' ? stint : null} onClose={close} />
      <GapResolveDialog stint={dialog?.kind === 'gap' ? stint : null} onClose={close} />
      <DepartureCaptureDialog stint={dialog?.kind === 'departure' ? stint : null} onClose={close} />
      <ReadingDialog
        selected={stint && reading ? { stint, reading } : null}
        onClose={close}
        amendReadings={sheet.can('amendReadings')}
      />
    </>
  );
}

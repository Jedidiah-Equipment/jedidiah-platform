import { formatNumber } from '@pkg/domain';
import { assignmentNeedsALookLevel, assignmentStateDisplayOrder, groupStints } from '@pkg/domain/contracting';
import type { JobDetail } from '@pkg/schema/contracting';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { ArrivalCaptureDialog } from './ArrivalCaptureDialog.js';
import { DepartureCaptureDialog } from './DepartureCaptureDialog.js';
import { GapResolveDialog } from './GapResolveDialog.js';
import { MachineStintCard } from './MachineStintCard.js';
import { PlanMachineDialog } from './PlanMachineDialog.js';
import { ReadingDialog } from './ReadingDialog.js';
import type { JobSheet, MachineDialog } from './types.js';

type MachineFilter = 'all' | 'planned' | 'on-site' | 'attention' | 'left' | 'repeat';
type NumberedStint = { stint: JobDetail['assignments'][number]; stintNumber: number };
const filters: { value: MachineFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'planned', label: 'Planned' },
  { value: 'on-site', label: 'On site' },
  { value: 'attention', label: 'Needs a look' },
  { value: 'left', label: 'Left' },
  { value: 'repeat', label: 'Repeat stint' },
];

function matches(filter: MachineFilter, { stint, stintNumber }: NumberedStint) {
  if (filter === 'all') return true;
  if (filter === 'attention') return assignmentNeedsALookLevel(stint) !== null;
  if (filter === 'repeat') return stintNumber > 1;
  return stint.state === filter;
}

/** All, plus each filter that narrows the list without emptying it. */
const offeredFilters = (stints: readonly NumberedStint[]) =>
  filters.filter(({ value }) => {
    if (value === 'all') return true;
    const count = stints.filter((stint) => matches(value, stint)).length;
    return count > 0 && count < stints.length;
  });

export function MachinesCard({ job, sheet }: { job: JobDetail; sheet: JobSheet }) {
  const planAction = sheet.action('assign');
  const [dialog, setDialog] = useState<MachineDialog | null>(null);
  const [filter, setFilter] = useState<MachineFilter>('all');
  const close = () => setDialog(null);
  const stint =
    dialog && dialog.kind !== 'plan' ? (job.assignments.find((entry) => entry.id === dialog.stintId) ?? null) : null;
  const reading = dialog?.kind === 'reading' ? (stint?.[dialog.role] ?? null) : null;
  const stints = useMemo(() => {
    const { machines, planned } = groupStints(job.assignments);
    const numbers = new Map<string, number>();
    return [...machines.flatMap((machine) => machine.stints), ...planned]
      .map((stint) => {
        const stintNumber = (numbers.get(stint.machineId) ?? 0) + 1;
        numbers.set(stint.machineId, stintNumber);
        return { stint, stintNumber };
      })
      .sort(
        (left, right) => assignmentStateDisplayOrder[left.stint.state] - assignmentStateDisplayOrder[right.stint.state],
      );
  }, [job.assignments]);
  const offered = offeredFilters(stints);
  const active = offered.some(({ value }) => value === filter) ? filter : 'all';
  const visible = stints.filter((stint) => matches(active, stint));
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
          {stints.length ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs value={active} onValueChange={(value) => setFilter(value as MachineFilter)}>
                  <TabsList aria-label="Filter machines">
                    {offered.map(({ value, label }) => (
                      <TabsTrigger key={value} value={value}>
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatNumber(visible.length)} of {formatNumber(stints.length)}
                </span>
              </div>
              {visible.length ? (
                <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2">
                  {visible.map(({ stint, stintNumber }) => (
                    <MachineStintCard
                      key={stint.id}
                      stint={stint}
                      stintNumber={stintNumber}
                      sheet={sheet}
                      onOpen={setDialog}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">No Machines match this filter.</p>
              )}
            </>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No Machines planned.</p>
          )}
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
        selected={stint && reading ? { machine: stint, reading } : null}
        onClose={close}
        amendReadings={sheet.can('amendReadings')}
      />
    </>
  );
}

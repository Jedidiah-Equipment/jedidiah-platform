import { groupStints } from '@pkg/domain/contracting';
import type { Assignment, JobDetail } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useTRPC } from '@/lib/trpc.js';
import { DepartureCaptureDialog } from './DepartureCaptureDialog.js';
import { GapResolveDialog } from './GapResolveDialog.js';
import { AttentionBadge, machineColumns } from './MachineCells.js';
import { MachinesContext, type SelectedReading, useMachineMutations } from './machines-context.js';
import { PlanMachineDialog } from './PlanMachineDialog.js';
import { ReadingSheet } from './ReadingSheet.js';
import type { JobCapabilities } from './types.js';

export function MachinesCard({ job, capabilities }: { job: JobDetail; capabilities: JobCapabilities }) {
  const trpc = useTRPC();
  const [planning, setPlanning] = useState(false);
  const [reading, setReading] = useState<SelectedReading | null>(null);
  const [gap, setGap] = useState<Assignment | null>(null);
  const [departure, setDeparture] = useState<Assignment | null>(null);
  const implementOptions = useQuery(
    trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: capabilities.planStints }),
  );
  const drivers = useQuery(
    trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled: capabilities.planStints }),
  );
  const mutations = useMachineMutations();
  const rows = useMemo(() => groupStints(job.assignments), [job.assignments]);
  const table = useDataTable({ data: rows, columns: machineColumns });
  const machines = useMemo(
    () => ({
      capabilities,
      implementOptions: implementOptions.data ?? [],
      drivers: drivers.data ?? [],
      mutations,
      openReading: setReading,
      openGap: setGap,
      openDeparture: setDeparture,
    }),
    [capabilities, implementOptions.data, drivers.data, mutations],
  );
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Machines</CardTitle>
          {capabilities.planStints ? (
            <CardAction>
              <Button onClick={() => setPlanning(true)}>Plan machine</Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorMessage
            error={mutations.patch.error ?? mutations.remove.error ?? mutations.removeMeasure.error}
            fallbackMessage="Unable to update Machines."
          />
          <MachinesContext.Provider value={machines}>
            <DataTable
              table={table}
              paginationMode="complete"
              total={rows.length}
              emptyMessage="No Machines planned."
              hideGlobalFilter
              getRowClassName={(row) => (row.kind === 'planned' ? 'opacity-60' : undefined)}
            />
          </MachinesContext.Provider>
          <NeedsALook job={job} canResolveGaps={capabilities.resolveGaps} onReading={setReading} onGap={setGap} />
        </CardContent>
      </Card>
      <PlanMachineDialog jobId={job.id} open={planning} onOpenChange={setPlanning} />
      <GapResolveDialog stint={gap} onClose={() => setGap(null)} />
      <DepartureCaptureDialog stint={departure} onClose={() => setDeparture(null)} />
      <ReadingSheet selected={reading} onClose={() => setReading(null)} amendReadings={capabilities.amendReadings} />
    </>
  );
}

/** Every flagged reading and open Gap Flag on the Job, each with the action that clears it. */
function NeedsALook({
  job,
  canResolveGaps,
  onReading,
  onGap,
}: {
  job: JobDetail;
  canResolveGaps: boolean;
  onReading: (selected: SelectedReading) => void;
  onGap: (stint: Assignment) => void;
}) {
  const attention = job.assignments.flatMap((stint) =>
    [stint.arrival, stint.departure].flatMap((item) => (item?.needsALook.length ? [{ stint, reading: item }] : [])),
  );
  const gaps = job.assignments.filter((stint) => stint.gapFlag);
  if (!attention.length && !gaps.length)
    return job.status === 'active' ? <p className="text-muted-foreground">Nothing needs a look</p> : null;
  return (
    <div className="rounded-lg border p-3">
      <h3 className="font-medium">Needs a look</h3>
      {attention.map(({ stint, reading }) => (
        <div key={reading.id} className="flex items-center justify-between gap-2 py-1">
          <span className="flex flex-wrap items-center gap-2">
            {stint.machineCode} · {reading.role === 'arrival' ? 'Arrival' : 'Departure'}
            {reading.needsALook.map((kind) => (
              <AttentionBadge key={kind} kind={kind} />
            ))}
          </span>
          <Button size="sm" variant="outline" onClick={() => onReading({ stint, reading })}>
            Open
          </Button>
        </div>
      ))}
      {gaps.map((stint) => (
        <div key={stint.id} className="flex items-center justify-between gap-2 py-1">
          <span>{stint.machineCode} · Gap Flag</span>
          {canResolveGaps ? (
            <Button size="sm" variant="outline" onClick={() => onGap(stint)}>
              Resolve
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

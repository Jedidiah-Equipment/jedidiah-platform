import { formatHours } from '@pkg/domain';
import { reportToSolvedHours } from '@pkg/domain/contracting';
import type { BreakdownDetail } from '@pkg/schema/contracting';
import { IconCheck, IconPencil, IconPlayerPlay, IconPlayerStop, IconUserPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { HelpLink } from '@/components/help/index.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { MechanicCombobox } from '@/contracting/components/MechanicCombobox.js';
import { type DotTone, IconAction, Timeline, TimelineRow } from '@/contracting/components/Timeline.js';
import { useContractingWrite, useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { MarkCompletedDialog } from './MarkCompletedDialog.js';
import type { BreakdownSheet } from './types.js';

const tick = <IconCheck aria-hidden="true" className="size-2.5 text-white" stroke={4} />;

/** Each step's dot: done, the one the workshop is waiting on, or not reached (or skipped). */
function stepTones(breakdown: BreakdownDetail): Record<'mechanic' | 'fixing' | 'fixed', DotTone> {
  const solved = breakdown.status === 'solved';
  const started = breakdown.startedAt !== null;
  const assigned = breakdown.primaryMechanicUserId !== null;
  return {
    mechanic: assigned ? 'done' : !solved && !started ? 'current' : 'empty',
    fixing: started ? 'done' : !solved && assigned ? 'current' : 'empty',
    fixed: solved ? 'done' : started ? 'current' : 'empty',
  };
}

function AssignMechanicDialog({
  breakdown,
  open,
  onOpenChange,
}: {
  breakdown: BreakdownDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateWorkshop);
  const mechanics = useQuery(trpc.contractingBreakdowns.options.mechanics.queryOptions(undefined, { enabled: open }));
  const assign = useMutation(
    trpc.contractingBreakdowns.assignMechanic.mutationOptions({
      onSuccess: async () => {
        await write.invalidate();
        onOpenChange(false);
      },
      onError: write.report,
    }),
  );
  useResetOnOpen(assign, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign mechanic</DialogTitle>
        </DialogHeader>
        <MechanicCombobox
          inputId="breakdown-mechanic"
          options={(mechanics.data ?? []).map((person) => ({ value: person.id, label: person.name }))}
          value={breakdown.primaryMechanicUserId}
          onValueChange={(mechanicUserId) => assign.mutate({ id: breakdown.id, mechanicUserId })}
        />
        <ErrorMessage error={mechanics.error} fallbackMessage="Unable to load mechanics." />
        <ErrorMessage error={assign.error} fallbackMessage="Unable to assign the Mechanic." />
      </DialogContent>
    </Dialog>
  );
}

/** The Breakdown's way through the workshop as a timeline: reported, mechanic, fixing, fixed. */
export function BreakdownWorkshopCard({ breakdown, sheet }: { breakdown: BreakdownDetail; sheet: BreakdownSheet }) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateWorkshop);
  const [solving, setSolving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const start = useMutation(trpc.contractingBreakdowns.start.mutationOptions(write.card('Unable to start work.')));
  const tones = stepTones(breakdown);
  const solved = breakdown.status === 'solved';
  const solvedHours = reportToSolvedHours(breakdown);
  const mechanicAction = sheet.can('assignMechanic') ? (
    <IconAction
      icon={breakdown.primaryMechanicUserId ? IconPencil : IconUserPlus}
      label={breakdown.primaryMechanicUserId ? 'Change mechanic' : 'Assign mechanic'}
      onClick={() => setAssigning(true)}
    />
  ) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workshop</CardTitle>
        <CardAction>
          <HelpLink label="How to run the workshop queue" topic="contractingBreakdown" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Timeline>
          <TimelineRow
            detail={
              <>
                <DateDisplay date={breakdown.reportedAt} format="medium" /> by {breakdown.reporterName}
              </>
            }
            title="Reported"
            tone={breakdown.urgency}
          />
          <TimelineRow
            actions={mechanicAction}
            detail={breakdown.mechanicName ?? (solved ? 'No mechanic was assigned' : 'Not assigned yet')}
            title="Mechanic"
            tone={tones.mechanic}
          />
          <TimelineRow
            actions={
              sheet.can('start') && !start.isPending ? (
                <IconAction
                  icon={IconPlayerPlay}
                  label="Start work"
                  onClick={() => start.mutate({ id: breakdown.id })}
                />
              ) : null
            }
            detail={
              breakdown.startedAt ? (
                <>
                  Started <DateDisplay date={breakdown.startedAt} format="medium" />
                </>
              ) : solved ? (
                'Went straight to Fixed'
              ) : (
                'Not started'
              )
            }
            title="Fixing"
            tone={tones.fixing}
          />
          <TimelineRow
            actions={
              sheet.can('solve') ? (
                <IconAction
                  icon={breakdown.status === 'in-progress' ? IconPlayerStop : IconCheck}
                  label="Mark completed"
                  onClick={() => setSolving(true)}
                />
              ) : null
            }
            detail={
              solved ? (
                <>
                  <span className="block">
                    <DateDisplay date={breakdown.solvedAt} format="medium" />
                    {breakdown.solvedByName ? ` · closed out by ${breakdown.solvedByName}` : null}
                    {solvedHours !== null ? ` · ${formatHours(solvedHours)} from report` : null}
                  </span>
                  {breakdown.closeOutNote ? (
                    <span className="mt-2 block border-l-2 border-emerald-500/60 pl-3">
                      <span className="block text-xs text-muted-foreground">Close-out note</span>
                      <span className="block text-sm whitespace-pre-wrap text-foreground">
                        {breakdown.closeOutNote}
                      </span>
                    </span>
                  ) : null}
                </>
              ) : (
                'Not fixed yet'
              )
            }
            dotContent={solved ? tick : null}
            title="Fixed"
            tone={tones.fixed}
          />
        </Timeline>
      </CardContent>
      <AssignMechanicDialog breakdown={breakdown} open={assigning} onOpenChange={setAssigning} />
      <MarkCompletedDialog breakdownId={breakdown.id} open={solving} onOpenChange={setSolving} />
    </Card>
  );
}

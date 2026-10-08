import { formatHours } from '@pkg/domain';
import { reportToSolvedHours } from '@pkg/domain/contracting';
import type { BreakdownDetail } from '@pkg/schema/contracting';
import { IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { HelpLink } from '@/components/help/index.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { MechanicCombobox } from '@/contracting/components/MechanicCombobox.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { MarkSolvedDialog } from './MarkSolvedDialog.js';
import type { BreakdownSheet } from './types.js';

export function BreakdownWorkshopCard({ breakdown, sheet }: { breakdown: BreakdownDetail; sheet: BreakdownSheet }) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateWorkshop);
  const [solving, setSolving] = useState(false);
  const canAssign = sheet.can('assignMechanic');
  const mechanics = useQuery(
    trpc.contractingBreakdowns.options.mechanics.queryOptions(undefined, { enabled: canAssign }),
  );
  const assign = useMutation(
    trpc.contractingBreakdowns.assignMechanic.mutationOptions(write.card('Unable to assign the Mechanic.')),
  );
  const start = useMutation(trpc.contractingBreakdowns.start.mutationOptions(write.card('Unable to start work.')));
  const startAction = sheet.action('start');
  const solveAction = sheet.action('solve');
  const solvedHours = reportToSolvedHours(breakdown);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workshop</CardTitle>
        <CardAction>
          <HelpLink label="How to run the workshop queue" topic="contractingBreakdown" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorMessage error={mechanics.error} fallbackMessage="Unable to load mechanics." />
        <div className="space-y-2">
          <span className="block text-sm font-medium">Mechanic</span>
          {canAssign ? (
            <MechanicCombobox
              inputId="breakdown-mechanic"
              options={(mechanics.data ?? []).map((person) => ({ value: person.id, label: person.name }))}
              value={breakdown.primaryMechanicUserId}
              onValueChange={(mechanicUserId) => assign.mutate({ id: breakdown.id, mechanicUserId })}
            />
          ) : (
            <p className="text-sm">{breakdown.mechanicName ?? 'Unassigned'}</p>
          )}
        </div>
        {startAction || solveAction ? (
          <div className="flex flex-wrap gap-2">
            {startAction ? (
              <Button
                variant="outline"
                {...startAction}
                disabled={startAction.disabled || start.isPending}
                onClick={() => start.mutate({ id: breakdown.id })}
              >
                <IconPlayerPlay className="text-primary" data-icon="inline-start" />
                Start work
              </Button>
            ) : null}
            {solveAction ? (
              // Completing is the stop moment once work has started; before then it is a plain alternative to starting.
              <Button variant="outline" {...solveAction} onClick={() => setSolving(true)}>
                {breakdown.status === 'in-progress' ? (
                  <IconPlayerStop className="text-primary" data-icon="inline-start" />
                ) : null}
                Mark completed
              </Button>
            ) : null}
          </div>
        ) : null}
        {breakdown.status === 'solved' ? (
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">Close-out note</dt>
            <dd className="whitespace-pre-wrap">{breakdown.closeOutNote}</dd>
            <dt className="text-muted-foreground">Fixed</dt>
            <dd>
              <DateDisplay date={breakdown.solvedAt} format="medium" />
              {breakdown.solvedByName ? ` by ${breakdown.solvedByName}` : null}
            </dd>
            {solvedHours !== null ? (
              <>
                <dt className="text-muted-foreground">Report to Fixed</dt>
                <dd>{formatHours(solvedHours)}</dd>
              </>
            ) : null}
          </dl>
        ) : breakdown.startedAt ? (
          <p className="text-sm text-muted-foreground">
            Work started <DateDisplay date={breakdown.startedAt} format="medium" />
          </p>
        ) : null}
      </CardContent>
      <MarkSolvedDialog breakdownId={breakdown.id} open={solving} onOpenChange={setSolving} />
    </Card>
  );
}

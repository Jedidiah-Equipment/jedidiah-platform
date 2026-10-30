import { formatDate, formatHours, formatNumber, formatQuantity, getFirstName } from '@pkg/domain';
import {
  type AttentionThresholds,
  assignmentAttentionSentence,
  assignmentStateColorClassNames,
  assignmentStateLabels,
  breakdownPhases,
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
  type JobSheet,
  type JobSheetStint,
  needsALookColorClassNames,
  travelProvenance,
} from '@pkg/domain/contracting';
import type { Assignment, BreakdownSummary, BreakdownUrgency, JobHoursValue } from '@pkg/schema/contracting';
import {
  IconAlertTriangle,
  IconCheck,
  IconFlagFilled,
  IconPencil,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconRuler2,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { IconAction, Timeline, TimelineRow } from '@/contracting/components/Timeline.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { AddMeasureDialog } from './AddMeasureDialog.js';
import { AssignmentEditDialog } from './AssignmentEditDialog.js';
import type { MachineDialog } from './types.js';
import { useJobWrite } from './use-job-write.js';

type Opens = { onOpen: (dialog: MachineDialog) => void };

/** The hours, when and by whom they were captured, and what John Deere had last read then. */
function ReadingDetail({ reading }: { reading: JobHoursValue }) {
  const captured = `captured ${formatDate(reading.at, 'medium')} by ${getFirstName(reading.byName)}`;
  const deere = reading.telematics
    ? `John Deere ${formatHours(reading.telematics.hours)} at ${formatDate(reading.telematics.at, 'medium')}`
    : null;
  const parts = [captured, deere, reading.comment].filter(Boolean);
  return (
    <span className="block truncate" title={[formatHours(reading.hours), ...parts].join(' · ')}>
      <span className="font-medium text-primary">{formatHours(reading.hours)}</span>
      {parts.map((part) => ` · ${part}`).join('')}
    </span>
  );
}

/** A captured reading's edit, or the capture it is still waiting on. */
function HoursAction({
  entry: { stint, sheet },
  side: role,
  onOpen,
}: { entry: JobSheetStint; side: 'arrival' | 'departure' } & Opens) {
  if (stint[role])
    return sheet.can('editHours') ? (
      <IconAction
        icon={IconPencil}
        label="Edit hours"
        onClick={() => onOpen({ kind: 'hours', mode: 'edit', stintId: stint.id })}
      />
    ) : null;
  const capture = role === 'arrival' ? 'captureArrival' : 'captureDeparture';
  if (!sheet.can(capture)) return null;
  return (
    <IconAction
      icon={role === 'arrival' ? IconPlayerPlay : IconPlayerStop}
      label={role === 'arrival' ? 'Start — capture arrival' : 'Stop — capture departure'}
      onClick={() => onOpen({ kind: 'hours', mode: role, stintId: stint.id })}
    />
  );
}

/** The amber badge per reason the stint needs a look, and the latest management edit of its hours. */
function StintAttention({ stint, thresholds }: { stint: Assignment; thresholds: AttentionThresholds }) {
  if (!stint.attention.length && !stint.amendment) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {stint.attention.map((kind) => (
        <Badge
          className={cn('h-auto whitespace-normal', needsALookColorClassNames.chip, needsALookColorClassNames.text)}
          key={kind}
          variant="outline"
        >
          <IconAlertTriangle aria-hidden="true" />
          {assignmentAttentionSentence(kind, stint, thresholds)}
        </Badge>
      ))}
      {stint.amendment ? (
        <span className="text-xs text-muted-foreground">
          {`Hours amended ${formatDate(stint.amendment.at, 'medium')} by ${getFirstName(stint.amendment.byName)} · ${stint.amendment.reason}`}
        </span>
      ) : null}
    </div>
  );
}

function MeasureDetail({ stint }: { stint: Assignment }) {
  return (
    <>{stint.measures.map((measure) => `${formatQuantity(measure.quantity)} ${measure.measureTypeName}`).join(', ')}</>
  );
}

/** A Breakdown's dot keeps its urgency's colour; a Fixed one carries a tick. */
function BreakdownRow({ breakdown }: { breakdown: BreakdownSummary }) {
  const navigate = useNavigate();
  const urgency = breakdownUrgencyLabels[breakdown.urgency];
  const status = breakdownStatusLabels[breakdown.status];
  const statusTone = breakdownStatusColorClassNames[breakdown.status];
  const fixed = breakdown.status === 'solved';
  const subject = breakdown.subject.kind === 'implement' ? `${breakdown.subject.code} · ` : '';
  const when = fixed && breakdown.solvedAt ? `Fixed ${formatDate(breakdown.solvedAt, 'day')} · ` : '';
  return (
    <TimelineRow
      actions={
        <IconAction
          icon={IconPencil}
          label={`Edit ${urgency} in the Workshop`}
          onClick={() => void navigate({ to: '/contracting/workshop/$id', params: { id: breakdown.id } })}
        />
      }
      detail={
        <span className="block truncate" title={`${when}${subject}${breakdown.firstLine}`}>
          {when}
          {subject}
          {breakdown.firstLine}
        </span>
      }
      dotContent={fixed ? <IconCheck aria-hidden="true" className="size-2.5 text-white" stroke={4} /> : null}
      title={
        <span className="flex items-center gap-2">
          {urgency}
          <Badge className={cn('h-4 px-1.5 text-[0.65rem]', statusTone.chip, statusTone.text)} variant="outline">
            {status}
          </Badge>
        </span>
      }
      tone={breakdown.urgency}
    />
  );
}

/** The plus under the timeline: adds a Measure or reports a Code Green or Code Red. */
function AddMenu({
  stint,
  onMeasure,
  canMeasure,
  canReport,
  onOpen,
}: { stint: Assignment; onMeasure: () => void; canMeasure: boolean; canReport: boolean } & Opens) {
  if (!canMeasure && !canReport) return null;
  const report = (urgency: BreakdownUrgency) => onOpen({ kind: 'breakdown', stintId: stint.id, urgency });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Add to ${stint.machineCode}`}
        render={<Button size="icon-sm" type="button" variant="outline" />}
      >
        <IconPlus aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canMeasure ? (
          <DropdownMenuItem onClick={onMeasure}>
            <IconRuler2 aria-hidden="true" />
            Add measure
          </DropdownMenuItem>
        ) : null}
        {canReport ? (
          <>
            <DropdownMenuItem onClick={() => report('code-green')}>
              <IconFlagFilled aria-hidden="true" className={breakdownUrgencyColorClassNames['code-green'].icon} />
              {breakdownUrgencyLabels['code-green']}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => report('code-red')}>
              <IconFlagFilled aria-hidden="true" className={breakdownUrgencyColorClassNames['code-red'].icon} />
              {breakdownUrgencyLabels['code-red']}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MachineStintCard({
  entry,
  sheet,
  breakdowns,
  thresholds,
  onOpen,
}: {
  entry: JobSheetStint;
  sheet: JobSheet;
  /** This stint's Breakdowns on the Job, oldest first. */
  breakdowns: readonly BreakdownSummary[];
  /** The thresholds the server judged this Job's stints against. */
  thresholds: AttentionThresholds;
} & Opens) {
  const trpc = useTRPC();
  const [measuring, setMeasuring] = useState(false);
  const readsMachines = useCan('contracting_machine:read').can;
  const { stint, number, sheet: stintSheet } = entry;
  const canMeasure = stintSheet.can('editMeasures');
  const canReport = sheet.can('reportBreakdown');
  const phases = breakdownPhases(stint, breakdowns);
  const breakdownRows = (phase: readonly BreakdownSummary[]) =>
    phase.map((breakdown) => <BreakdownRow breakdown={breakdown} key={breakdown.id} />);
  const write = useJobWrite();
  const remove = useMutation(
    trpc.contractingJobs.assignments.remove.mutationOptions(write.card('Unable to remove Machine Assignment.')),
  );
  const planned = stint.state === 'planned';
  const onSite = stint.state === 'on-site';
  const stintLabel = number === 1 ? 'First stint' : number === 2 ? 'Second stint' : `Stint ${formatNumber(number)}`;
  return (
    <Card
      className={cn(
        'gap-0 overflow-visible data-[size=sm]:gap-0',
        stint.attention.length > 0 && needsALookColorClassNames.border,
      )}
      size="sm"
    >
      <CardHeader className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 pb-4">
        <CategoryIcon colour={stint.categoryColour} icon={stint.categoryIcon} size={20} />
        <div className="min-w-0">
          {readsMachines ? (
            <Link
              className="block truncate text-base leading-5 font-semibold hover:underline"
              params={{ id: stint.machineId }}
              to="/contracting/fleet/$id/edit"
            >
              {stint.machineCode}
            </Link>
          ) : (
            <strong className="block truncate text-base leading-5 font-semibold">{stint.machineCode}</strong>
          )}
          <span className="block truncate text-xs text-muted-foreground">
            {stint.categoryName} · {stintLabel}
          </span>
        </div>
        <Badge
          className={cn(
            'self-start',
            assignmentStateColorClassNames[stint.state].chip,
            assignmentStateColorClassNames[stint.state].text,
          )}
          variant="outline"
        >
          {assignmentStateLabels[stint.state]}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <Timeline className="mb-3">
          <TimelineRow
            actions={
              stintSheet.can('changeResources') ? (
                <>
                  <AssignmentEditDialog stint={stint} />
                  {stintSheet.can('remove') ? (
                    <RemoveEntityButton
                      description="Remove this Machine Assignment?"
                      isPending={remove.isPending}
                      onConfirm={() => remove.mutate({ id: stint.id })}
                      title={<MachineDialogTitle machine={stint}>Remove planned Machine</MachineDialogTitle>}
                      triggerIconOnly
                      triggerLabel={`Remove ${stint.machineCode}`}
                      triggerSize="icon-sm"
                      triggerVariant="outline"
                    />
                  ) : null}
                </>
              ) : null
            }
            detail={`${stint.implementCode ?? 'No implement'} · ${stint.driverName ? getFirstName(stint.driverName) : 'No driver'}`}
            title="Planned"
            tone="done"
          />
          {breakdownRows(phases.beforeArrival)}
          <TimelineRow
            actions={<HoursAction entry={entry} onOpen={onOpen} side="arrival" />}
            detail={stint.arrival ? <ReadingDetail reading={stint.arrival} /> : 'Awaiting arrival hours'}
            title="Arrival"
            tone={stint.arrival ? 'done' : planned ? 'current' : 'empty'}
          />
          {breakdownRows(phases.onSite)}
          <TimelineRow
            actions={<HoursAction entry={entry} onOpen={onOpen} side="departure" />}
            detail={stint.departure ? <ReadingDetail reading={stint.departure} /> : 'Not yet captured'}
            title="Departure"
            tone={stint.departure ? 'done' : onSite ? 'current' : 'empty'}
          />
          {breakdownRows(phases.afterDeparture)}
          {stint.measures.length ? (
            <TimelineRow
              actions={
                canMeasure ? (
                  <IconAction icon={IconPencil} label="Edit measures" onClick={() => setMeasuring(true)} />
                ) : null
              }
              detail={<MeasureDetail stint={stint} />}
              title="Measures"
              tone="done"
            />
          ) : null}
        </Timeline>
        <StintAttention stint={stint} thresholds={thresholds} />
        <div className="-mt-1 mb-4 flex justify-end">
          <AddMenu
            canMeasure={canMeasure}
            canReport={canReport}
            onMeasure={() => setMeasuring(true)}
            onOpen={onOpen}
            stint={stint}
          />
        </div>
        {canMeasure ? <AddMeasureDialog onOpenChange={setMeasuring} open={measuring} stint={stint} /> : null}
        <div className="mt-auto flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          {stint.workHours !== null ? (
            <span>
              Work <strong className="text-foreground">{formatHours(stint.workHours)}</strong>
            </span>
          ) : (
            <span>No hours yet</span>
          )}
          {stint.travelHours !== null ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="whitespace-nowrap">
                Travel <strong className="text-foreground">{formatHours(stint.travelHours)}</strong>
                {` · ${travelProvenance(stint)}`}
              </span>
              {stintSheet.can('setTravel') ? (
                <IconAction
                  icon={IconPencil}
                  label="Set Travel Hours"
                  onClick={() => onOpen({ kind: 'travel', stintId: stint.id })}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

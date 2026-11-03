import { formatDate, formatHours, formatNumber, formatQuantity, getFirstName } from '@pkg/domain';
import {
  type AttentionThresholds,
  assignmentAttentionSentence,
  assignmentStateColorClassNames,
  assignmentStateLabels,
  attentionBadges,
  breakdownPhases,
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
  JD_LINK_LABEL,
  type JobSheet,
  type JobSheetStint,
  needsALookColorClassNames,
  travelProvenance,
} from '@pkg/domain/contracting';
import type {
  Assignment,
  AssignmentAttentionKind,
  BreakdownSummary,
  BreakdownUrgency,
  DismissedAttention,
  JobHoursValue,
} from '@pkg/schema/contracting';
import {
  IconAlertTriangle,
  IconCheck,
  IconFlagFilled,
  IconPencil,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconRuler2,
  IconX,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { IconAction, Timeline, TimelineRow } from '@/contracting/components/Timeline.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { AddMeasureDialog } from './AddMeasureDialog.js';
import { AssignmentEditDialog } from './AssignmentEditDialog.js';
import { RemoveStintButton } from './RemoveStintButton.js';
import type { MachineDialog } from './types.js';
import { useJobWrite } from './use-job-write.js';

type Opens = { onOpen: (dialog: MachineDialog) => void };

/** The hours, who captured them and the comment; when, and what JD Link had read then, extend the hover title. */
function ReadingDetail({ reading }: { reading: JobHoursValue }) {
  const shown = [formatHours(reading.hours), `Captured by ${getFirstName(reading.byName)}`, reading.comment];
  const telematics = reading.telematics;
  const title = [
    ...shown,
    `captured ${formatDate(reading.at, 'medium')}`,
    telematics ? `${JD_LINK_LABEL} ${formatHours(telematics.hours)} at ${formatDate(telematics.at, 'medium')}` : null,
  ];
  const [hours, ...rest] = shown;
  return (
    <span className="block truncate" title={title.filter(Boolean).join(' · ')}>
      <span className="font-medium text-primary">{hours}</span>
      {rest
        .filter(Boolean)
        .map((part) => ` · ${part}`)
        .join('')}
    </span>
  );
}

/** A captured reading's edit, or the capture it is still waiting on. */
function HoursAction({
  entry: { stint, sheet },
  side,
  onOpen,
}: { entry: JobSheetStint; side: 'arrival' | 'departure' } & Opens) {
  if (stint[side])
    return sheet.can('editHours') ? (
      <IconAction
        icon={IconPencil}
        label="Edit hours"
        onClick={() => onOpen({ kind: 'hours', mode: 'edit', stintId: stint.id })}
      />
    ) : null;
  const capture = side === 'arrival' ? 'captureArrival' : 'captureDeparture';
  if (!sheet.can(capture)) return null;
  return (
    <IconAction
      icon={side === 'arrival' ? IconPlayerPlay : IconPlayerStop}
      label={side === 'arrival' ? 'Start — capture arrival' : 'Stop — capture departure'}
      onClick={() => onOpen({ kind: 'hours', mode: side, stintId: stint.id })}
    />
  );
}

const attentionBadgeClassName = cn(
  'h-auto whitespace-normal',
  needsALookColorClassNames.chip,
  needsALookColorClassNames.text,
);

/** A reason the stint needs a look, with a dismiss control for whoever may dismiss it. */
function NeedsALookBadge({
  stint,
  kind,
  sentence,
  canDismiss,
}: {
  stint: Assignment;
  kind: AssignmentAttentionKind;
  sentence: string;
  canDismiss: boolean;
}) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const dismiss = useMutation(
    trpc.contractingJobs.assignments.dismissAttention.mutationOptions(write.card('Unable to dismiss the warning.')),
  );
  return (
    <Badge className={attentionBadgeClassName} variant="outline">
      <IconAlertTriangle aria-hidden="true" />
      {sentence}
      {canDismiss ? (
        <button
          aria-label={`Dismiss for everyone: ${sentence}`}
          className="-mr-1 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-orange-500/20 focus-visible:opacity-100 disabled:opacity-50 group-hover/badge:opacity-100 pointer-coarse:opacity-100"
          disabled={dismiss.isPending}
          onClick={() => dismiss.mutate({ assignmentId: stint.id, kind })}
          title="Dismiss for everyone"
          type="button"
        >
          <IconX aria-hidden="true" className="size-3" />
        </button>
      ) : null}
    </Badge>
  );
}

/** A dismissed reason, faded in its own place; hovering brings it back and says who dismissed it, and when. */
function DismissedBadge({ sentence, dismissal }: { sentence: string; dismissal: DismissedAttention }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            className={cn(attentionBadgeClassName, 'opacity-30 transition-opacity hover:opacity-100')}
            variant="outline"
          />
        }
      >
        <IconAlertTriangle aria-hidden="true" />
        {sentence}
      </TooltipTrigger>
      <TooltipContent>
        {`Dismissed by ${getFirstName(dismissal.dismissedByName)} · `}
        <DateDisplay date={dismissal.dismissedAt} format="medium" />
      </TooltipContent>
    </Tooltip>
  );
}

/** The stint's needs-a-look badges, dismissed ones faded in place, and the latest management edit of its hours. */
function StintAttention({
  stint,
  thresholds,
  canDismiss,
}: {
  stint: Assignment;
  thresholds: AttentionThresholds;
  canDismiss: boolean;
}) {
  const badges = attentionBadges(stint);
  if (!badges.length && !stint.amendment) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {badges.map(({ kind, dismissal }) => {
        const sentence = assignmentAttentionSentence(kind, stint, thresholds);
        return dismissal ? (
          <DismissedBadge dismissal={dismissal} key={kind} sentence={sentence} />
        ) : (
          <NeedsALookBadge canDismiss={canDismiss} key={kind} kind={kind} sentence={sentence} stint={stint} />
        );
      })}
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
  const [measuring, setMeasuring] = useState(false);
  const readsMachines = useCan('contracting_machine:read').can;
  const { stint, number, sheet: stintSheet } = entry;
  const canMeasure = stintSheet.can('editMeasures');
  const canReport = sheet.can('reportBreakdown');
  const phases = breakdownPhases(stint, breakdowns);
  const breakdownRows = (phase: readonly BreakdownSummary[]) =>
    phase.map((breakdown) => <BreakdownRow breakdown={breakdown} key={breakdown.id} />);
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
              <>
                {stintSheet.can('changeResources') ? <AssignmentEditDialog stint={stint} /> : null}
                {stintSheet.can('remove') ? <RemoveStintButton stint={stint} /> : null}
              </>
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
        <StintAttention canDismiss={stintSheet.can('dismissAttention')} stint={stint} thresholds={thresholds} />
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

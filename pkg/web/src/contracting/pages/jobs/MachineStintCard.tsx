import { formatDate, formatHours, formatNumber } from '@pkg/domain';
import {
  assignmentAttentionKindLabels,
  assignmentAttentionKindLevels,
  assignmentAttentionLevelColorClassNames,
  assignmentNeedsALookLevel,
  assignmentStateColorClassNames,
  GAP_FLAG_THRESHOLD_HOURS,
  isOverGapWindow,
  judgeAssignmentAction,
  needsALook,
} from '@pkg/domain/contracting';
import type {
  Assignment,
  AssignmentAttentionLevel,
  JobReading,
  JobReadingAttentionKind,
  NeedsALookLevel,
} from '@pkg/schema/contracting';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconEye,
  IconHourglass,
  IconPencil,
  IconPencilCheck,
  IconPhotoOff,
  IconPlayerPlay,
  IconPlayerStop,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { readingEvidence } from '@/contracting/components/ReadingEvidence.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { AddMeasureDialog } from './AddMeasureDialog.js';
import { AssignmentEditDialog } from './AssignmentEditDialog.js';
import type { JobSheet, MachineDialog } from './types.js';
import { useJobWrite } from './use-job-write.js';

type Opens = { onOpen: (dialog: MachineDialog) => void };

type DotTone = 'done' | 'current' | 'empty' | NeedsALookLevel;

function TimelineRow({
  title,
  detail,
  tone,
  actions,
}: {
  title: string;
  detail: React.ReactNode;
  tone: DotTone;
  actions?: React.ReactNode;
}) {
  return (
    <li className="relative flex min-h-9 items-start justify-between gap-2">
      <span
        aria-hidden="true"
        className={cn(
          'absolute -left-[27px] top-1 size-3 rounded-full border-2',
          tone === 'done' && 'border-emerald-500 bg-emerald-500',
          tone === 'current' && 'border-primary bg-primary',
          tone === 'empty' && 'border-muted-foreground bg-card',
          (tone === 'warning' || tone === 'critical') &&
            `border-transparent ${assignmentAttentionLevelColorClassNames[tone].dot}`,
        )}
      />
      <div className="min-w-0">
        <strong className="block text-sm leading-5 font-medium">{title}</strong>
        <div className="text-xs leading-4 text-muted-foreground">{detail}</div>
      </div>
      {actions ? <div className="flex shrink-0 items-start gap-1">{actions}</div> : null}
    </li>
  );
}

function IconAction({
  label,
  icon: Icon,
  onClick,
  level,
}: {
  label: string;
  icon: TablerIcon;
  onClick: () => void;
  /** Paints the button in an assignment attention level's colours. */
  level?: AssignmentAttentionLevel;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={level ? assignmentAttentionLevelColorClassNames[level].button : undefined}
            onClick={onClick}
            size="icon-sm"
            type="button"
            variant="outline"
          />
        }
      >
        <Icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const readingAttentionIcons: Record<JobReadingAttentionKind, TablerIcon> = {
  disputed: IconAlertTriangle,
  'ai-disagrees': IconAlertTriangle,
  'ai-low-confidence': IconAlertTriangle,
  'ai-pending': IconHourglass,
  'missing-photo': IconPhotoOff,
};

function ReadingActions({ reading, stint, onOpen }: { reading: JobReading; stint: Assignment } & Opens) {
  const role = reading.role === 'arrival' ? 'arrival' : 'departure';
  // An amendment settles the reading's notices, so only what still needs a look keeps its own icon.
  const shown = reading.amendedAt
    ? reading.attention.filter((kind) => needsALook(assignmentAttentionKindLevels[kind]))
    : reading.attention;
  if (!shown.length)
    return (
      <IconAction
        icon={reading.amendedAt ? IconPencilCheck : IconEye}
        label={reading.amendedAt ? `View amended ${role} reading` : `View ${role} reading`}
        onClick={() => onOpen({ kind: 'reading', stintId: stint.id, role })}
      />
    );
  return shown.map((kind) => (
    <IconAction
      icon={readingAttentionIcons[kind]}
      key={kind}
      label={`Review ${role} · ${assignmentAttentionKindLabels[kind]}`}
      level={assignmentAttentionKindLevels[kind]}
      onClick={() => onOpen({ kind: 'reading', stintId: stint.id, role })}
    />
  ));
}

/** When, by whom and why a reading was amended, or null when it never was. */
function amendmentSummary(reading: JobReading) {
  if (!reading.amendedAt) return null;
  const by = reading.amendedByName ? ` by ${reading.amendedByName}` : '';
  const why = reading.amendmentReason ? ` · ${reading.amendmentReason}` : '';
  return `Amended ${formatDate(reading.amendedAt, 'medium')}${by}${why}`;
}

function ReadingDetail({ reading }: { reading: JobReading }) {
  const evidence = readingEvidence(reading);
  const amendment = amendmentSummary(reading);
  return (
    <span className="block truncate" title={`${formatHours(reading.value)} · ${evidence.evidenceLabel}`}>
      <span className="font-medium text-primary">{formatHours(reading.value)}</span>
      {amendment ? (
        <>
          {' · '}
          <Tooltip>
            <TooltipTrigger render={<button className="text-foreground" type="button" />}>Amended</TooltipTrigger>
            <TooltipContent>{amendment}</TooltipContent>
          </Tooltip>
        </>
      ) : null}
      {' · '}
      {evidence.evidenceLabel}
    </span>
  );
}

function GapStatus({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<button aria-label={label} className="inline-flex p-1" type="button" />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const gapFlagLevel = assignmentAttentionKindLevels['gap-flag'];

function previousJobLabel(stint: Assignment) {
  const job = stint.previousDeparture?.job;
  return job ? `since leaving ${job.jobNumber}` : 'since its last departure';
}

/** One truncated line: the gap's hours, an optional lead phrase, then its details, with the full text on hover. */
function GapDetail({
  hours,
  hoursClassName,
  lead,
  parts,
}: {
  hours: string;
  hoursClassName: string;
  lead?: string;
  parts: string[];
}) {
  const head = lead ? ` ${lead}` : '';
  const tail = parts.map((part) => ` · ${part}`).join('');
  return (
    <span className="block truncate" title={`${hours}${head}${tail}`}>
      <span className={cn('font-medium', hoursClassName)}>{hours}</span>
      {head}
      {tail}
    </span>
  );
}

/** The Hour Gap between the Machine's previous departure and this arrival: flagged, resolved, or counted as travel. */
function GapRow({ stint, sheet, onOpen }: { stint: Assignment; sheet: JobSheet } & Opens) {
  const gapHours = stint.gapHours;
  if (gapHours === null || gapHours === 0) return null;
  const verdict = judgeAssignmentAction('resolveGap', stint);
  const why = !sheet.can('resolveGaps') ? sheet.refusal('resolveGaps') : verdict.allowed ? null : verdict.message;
  const open = () => onOpen({ kind: 'gap', stintId: stint.id });
  const edit = why ? null : <IconAction icon={IconPencil} label="Edit gap split" onClick={open} />;
  const hours = formatHours(gapHours);
  // A gap over the window keeps the Gap Flag's colour on its dot, open or resolved.
  const tone = isOverGapWindow(gapHours) && needsALook(gapFlagLevel) ? gapFlagLevel : ('done' as const);

  if (stint.gapFlag)
    return (
      <TimelineRow
        actions={
          why ? (
            <GapStatus label={`${assignmentAttentionKindLabels['gap-flag']} · ${hours} gap · ${why}`}>
              <IconAlertTriangle
                aria-hidden="true"
                className={cn('size-5', assignmentAttentionLevelColorClassNames[gapFlagLevel].icon)}
              />
            </GapStatus>
          ) : (
            <IconAction icon={IconAlertTriangle} label={`Resolve gap · ${hours}`} level={gapFlagLevel} onClick={open} />
          )
        }
        detail={
          <GapDetail
            hours={hours}
            hoursClassName={assignmentAttentionLevelColorClassNames[gapFlagLevel].text}
            lead={previousJobLabel(stint)}
            parts={[`over the ${formatHours(GAP_FLAG_THRESHOLD_HOURS)} window`]}
          />
        }
        title="Gap"
        tone={tone}
      />
    );

  return (
    <TimelineRow
      actions={edit}
      detail={
        <GapDetail
          hours={hours}
          hoursClassName="text-foreground"
          parts={
            stint.gapResolved
              ? [
                  `${formatHours(stint.travelHours)} travel`,
                  `${formatHours(stint.unaccountedHours)} unaccounted`,
                  ...(stint.gapReason ? [stint.gapReason] : []),
                ]
              : [stint.travelIncluded ? 'counted as travel' : 'not billed, travel excluded']
          }
        />
      }
      title="Gap"
      tone={tone}
    />
  );
}

function MeasureDetail({ stint }: { stint: Assignment }) {
  if (!stint.measures.length) return <>None recorded</>;
  return (
    <>
      {stint.measures
        .map(
          (measure) =>
            `${formatNumber(measure.quantity, { decimals: Number.isInteger(measure.quantity) ? 0 : 2 })} ${measure.measureTypeName}`,
        )
        .join(', ')}
    </>
  );
}

export function MachineStintCard({
  stint,
  stintNumber,
  sheet,
  onOpen,
}: { stint: Assignment; stintNumber: number; sheet: JobSheet } & Opens) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const travel = useMutation(
    trpc.contractingJobs.assignments.patch.mutationOptions(write.card('Unable to update Machine Assignment.')),
  );
  const remove = useMutation(
    trpc.contractingJobs.assignments.remove.mutationOptions(write.card('Unable to remove Machine Assignment.')),
  );
  const planned = stint.state === 'planned';
  const onSite = stint.state === 'on-site';
  const lookLevel = assignmentNeedsALookLevel(stint);
  const stintLabel =
    stintNumber === 1 ? 'First stint' : stintNumber === 2 ? 'Second stint' : `Stint ${formatNumber(stintNumber)}`;
  return (
    <Card
      className={cn(
        'gap-0 overflow-visible data-[size=sm]:gap-0',
        lookLevel && assignmentAttentionLevelColorClassNames[lookLevel].border,
      )}
      size="sm"
    >
      <CardHeader className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 pb-4">
        <CategoryIcon colour={stint.categoryColour} icon={stint.categoryIcon} size={20} />
        <div className="min-w-0">
          <strong className="block truncate text-base leading-5 font-semibold">{stint.machineCode}</strong>
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
          {planned ? 'Planned' : onSite ? 'On site' : 'Left site'}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <ol className="mb-4 ml-2 space-y-3 border-l border-border pl-5">
          <TimelineRow
            actions={
              sheet.can('assign') && judgeAssignmentAction('changeResources', stint).allowed ? (
                <>
                  <AssignmentEditDialog stint={stint} />
                  {judgeAssignmentAction('remove', stint).allowed ? (
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
            detail={`${stint.implementCode ?? 'No implement'} · ${stint.driverName ?? 'No driver'}`}
            title="Planned"
            tone="done"
          />
          <GapRow onOpen={onOpen} sheet={sheet} stint={stint} />
          <TimelineRow
            actions={
              stint.arrival ? (
                <ReadingActions reading={stint.arrival} stint={stint} onOpen={onOpen} />
              ) : sheet.can('capture') ? (
                <IconAction
                  icon={IconPlayerPlay}
                  label="Start — capture arrival"
                  onClick={() => onOpen({ kind: 'arrival', stintId: stint.id })}
                />
              ) : null
            }
            detail={stint.arrival ? <ReadingDetail reading={stint.arrival} /> : 'Awaiting hour reading'}
            title="Arrival"
            tone={stint.arrival ? 'done' : planned ? 'current' : 'empty'}
          />
          <TimelineRow
            actions={
              stint.departure ? (
                <ReadingActions reading={stint.departure} stint={stint} onOpen={onOpen} />
              ) : onSite && sheet.can('capture') ? (
                <IconAction
                  icon={IconPlayerStop}
                  label="Stop — capture departure"
                  onClick={() => onOpen({ kind: 'departure', stintId: stint.id })}
                />
              ) : null
            }
            detail={stint.departure ? <ReadingDetail reading={stint.departure} /> : 'Not yet captured'}
            title="Departure"
            tone={stint.departure ? 'done' : onSite ? 'current' : 'empty'}
          />
          <TimelineRow
            actions={
              sheet.can('editMeasures') && judgeAssignmentAction('editMeasures', stint).allowed ? (
                <AddMeasureDialog stint={stint} />
              ) : null
            }
            detail={<MeasureDetail stint={stint} />}
            title="Measures"
            tone={stint.measures.length ? 'done' : 'empty'}
          />
        </ol>
        <div className="mt-auto flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          {stint.workHours !== null ? (
            <span>
              Work <strong className="text-foreground">{formatHours(stint.workHours)}</strong>
            </span>
          ) : (
            <span>No hours yet</span>
          )}
          {!planned ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="whitespace-nowrap">
                Travel <strong className="text-foreground">{formatHours(stint.travelHours)}</strong>
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`Travel time for ${stint.machineCode}: ${stint.travelIncluded ? 'Include travel' : 'Exclude travel'}`}
                  render={<Button disabled={!sheet.can('patchTravel')} size="xs" type="button" variant="outline" />}
                >
                  {stint.travelIncluded ? 'Include travel' : 'Exclude travel'}
                  <IconChevronDown data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuRadioGroup
                    onValueChange={(value) => travel.mutate({ id: stint.id, travelIncluded: value === 'include' })}
                    value={stint.travelIncluded ? 'include' : 'exclude'}
                  >
                    <DropdownMenuRadioItem className="items-start py-2 pr-8" closeOnClick value="include">
                      <span className="flex flex-col gap-1">
                        <span className="font-medium">Include travel</span>
                        <span className="text-xs text-muted-foreground">
                          Automatically count the hours between the previous departure and this arrival as travel.
                        </span>
                      </span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem className="items-start py-2 pr-8" closeOnClick value="exclude">
                      <span className="flex flex-col gap-1">
                        <span className="font-medium">Exclude travel</span>
                        <span className="text-xs text-muted-foreground">
                          Do not automatically count those hours as travel.
                        </span>
                      </span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

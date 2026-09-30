import { formatHours, formatNumber } from '@pkg/domain';
import { assignmentStateColorClassNames } from '@pkg/domain/contracting';
import type { Assignment, JobReading } from '@pkg/schema/contracting';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconCircleCheck,
  IconEye,
  IconPhotoOff,
  IconPlayerPlay,
  IconPlayerStop,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
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
import { cn } from '@/lib/utils.js';
import { AddMeasureDialog } from './AddMeasureDialog.js';
import { AssignmentEditDialog } from './AssignmentEditDialog.js';
import { useMachines } from './machines-context.js';

type DotTone = 'done' | 'current' | 'empty';

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
  tone,
}: {
  label: string;
  icon: TablerIcon;
  onClick: () => void;
  tone?: 'warning' | 'danger' | 'success';
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn(
              tone === 'warning' &&
                'border-warning/60 bg-warning/15 text-warning hover:bg-warning/25 dark:border-warning/60 dark:bg-warning/15 dark:hover:bg-warning/25',
              tone === 'danger' && 'border-destructive/50 bg-destructive/10 text-destructive',
              tone === 'success' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
            )}
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

const attentionLabels: Record<JobReading['needsALook'][number], string> = {
  disputed: 'disputed',
  'ai-pending': 'AI verification pending',
  'ai-disagrees': 'AI value differs',
  'ai-low-confidence': 'AI confidence low',
  'missing-photo': 'missing photo',
};

function ReadingActions({ reading, stint }: { reading: JobReading; stint: Assignment }) {
  const { openReading } = useMachines();
  const role = reading.role === 'arrival' ? 'arrival' : 'departure';
  if (!reading.needsALook.length)
    return <IconAction icon={IconEye} label={`View ${role} reading`} onClick={() => openReading({ reading, stint })} />;
  return reading.needsALook.map((kind) => (
    <IconAction
      icon={kind === 'missing-photo' ? IconPhotoOff : IconAlertTriangle}
      key={kind}
      label={`Review ${role} · ${attentionLabels[kind]}`}
      onClick={() => openReading({ reading, stint })}
      tone={kind === 'disputed' ? 'danger' : 'warning'}
    />
  ));
}

function ReadingDetail({ reading }: { reading: JobReading }) {
  const evidence = readingEvidence(reading);
  return (
    <span className="block truncate" title={`${formatHours(reading.value)} · ${evidence.evidenceLabel}`}>
      <span className="font-medium text-primary">{formatHours(reading.value)}</span> · {evidence.evidenceLabel}
    </span>
  );
}

function GapAction({ stint }: { stint: Assignment }) {
  const { sheet, openGap } = useMachines();
  if (stint.gapFlag)
    return sheet.can('resolveGaps') ? (
      <IconAction
        icon={IconAlertTriangle}
        label={`Resolve gap · ${formatHours(stint.gapHours ?? 0)}`}
        onClick={() => openGap(stint)}
        tone="warning"
      />
    ) : (
      <Badge className="border-warning/50 text-warning-foreground" variant="outline">
        Gap flag
      </Badge>
    );
  if (stint.gapResolved)
    return (
      <Tooltip>
        <TooltipTrigger render={<button aria-label="Gap resolved" className="inline-flex" type="button" />}>
          <IconCircleCheck aria-hidden="true" className="size-5 text-emerald-500" />
        </TooltipTrigger>
        <TooltipContent>
          {formatHours(stint.travelHours)} travel · {formatHours(stint.unaccountedHours)} unaccounted
          {stint.gapReason ? ` · ${stint.gapReason}` : ''}
        </TooltipContent>
      </Tooltip>
    );
  return null;
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

export function MachineStintCard({ stint, stintNumber }: { stint: Assignment; stintNumber: number }) {
  const { sheet, mutations, openArrival, openDeparture } = useMachines();
  const planned = stint.state === 'planned';
  const onSite = stint.state === 'on-site';
  const needsALook = stint.gapFlag || !!stint.arrival?.needsALook.length || !!stint.departure?.needsALook.length;
  const stintLabel =
    stintNumber === 1 ? 'First stint' : stintNumber === 2 ? 'Second stint' : `Stint ${formatNumber(stintNumber)}`;
  return (
    <Card className={cn('gap-0 overflow-visible data-[size=sm]:gap-0', needsALook && 'border-warning/60')} size="sm">
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
      <CardContent>
        <ol className="ml-2 space-y-3 border-l border-border pl-5">
          <TimelineRow
            actions={
              sheet.can('assign') && stint.state !== 'left' ? (
                <>
                  <AssignmentEditDialog stint={stint} />
                  {planned ? (
                    <RemoveEntityButton
                      description="Remove this Machine Assignment?"
                      isPending={mutations.remove.isPending}
                      onConfirm={() => mutations.remove.mutate({ id: stint.id })}
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
          <TimelineRow
            actions={
              stint.arrival ? (
                <>
                  <ReadingActions reading={stint.arrival} stint={stint} />
                  <GapAction stint={stint} />
                </>
              ) : sheet.can('capture') ? (
                <IconAction icon={IconPlayerPlay} label="Start — capture arrival" onClick={() => openArrival(stint)} />
              ) : null
            }
            detail={stint.arrival ? <ReadingDetail reading={stint.arrival} /> : 'Awaiting hour reading'}
            title="Arrival"
            tone={stint.arrival ? 'done' : planned ? 'current' : 'empty'}
          />
          <TimelineRow
            actions={
              stint.departure ? (
                <ReadingActions reading={stint.departure} stint={stint} />
              ) : onSite && (sheet.showsSignOff || sheet.can('resolveGaps')) ? (
                <IconAction
                  icon={IconPlayerStop}
                  label="Stop — capture departure"
                  onClick={() => openDeparture(stint)}
                />
              ) : null
            }
            detail={stint.departure ? <ReadingDetail reading={stint.departure} /> : 'Not yet captured'}
            title="Departure"
            tone={stint.departure ? 'done' : onSite ? 'current' : 'empty'}
          />
          <TimelineRow
            actions={!planned && sheet.can('editMeasures') ? <AddMeasureDialog stint={stint} /> : null}
            detail={<MeasureDetail stint={stint} />}
            title="Measures"
            tone={stint.measures.length ? 'done' : 'empty'}
          />
        </ol>
        <div className="mt-4 flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
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
                    onValueChange={(value) =>
                      mutations.patch.mutate({ id: stint.id, travelIncluded: value === 'include' })
                    }
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

import {
  addJobSlotDuration,
  type SlotCalendarDays,
  segmentSlotCalendarDays,
  summarizeSlotCalendarDays,
  type WorkingCalendar,
} from '@pkg/domain';
import type { DateOnlyIso, JobSlotMoveDirection, JobSlotPlacement, JobSummary, UUID } from '@pkg/schema';
import { IconArrowLeft, IconArrowRight, IconClockPlus, IconLoader2, IconTrash } from '@tabler/icons-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useGanttContext } from '@/components/kibo-ui/gantt/index.js';
import { Button } from '@/components/ui/button.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { cn } from '@/lib/utils.js';
import { BaySlotDayHatch, BaySlotJobCard } from './BaySlotJobCard.js';
import type { DisplayBaySlot } from './bay-schedule-ghosts.js';
import { getSlotLabel } from './bay-schedule-summary.js';
import { InfoList, SlotDayBreakdownRows } from './JobInfoList.js';
import { getJobGanttOffset, getJobGanttResizeStepWidth, getJobGanttWidth } from './job-gantt-geometry.js';

// Slot card height, leaving a small inset above/below within the (taller) bay row.
export const SLOT_CARD_HEIGHT = 60;
// Trim each slot's width so contiguous slots leave a hairline gap instead of their
// borders/rings butting into (and visually overlapping) the next slot.
const SLOT_GAP = 3;
const IDLE_SLOT_HATCH_BACKGROUND =
  'repeating-linear-gradient(45deg, rgb(113 113 122 / 0.18) 0 5px, transparent 5px 10px)';

type SlotResizeDrag = {
  durationDays: number;
  initialDurationDays: number;
  pixelsPerDay: number;
  startX: number;
};

export const BaySlotBar: React.FC<{
  bayId: UUID;
  canEditSchedule: boolean;
  isDimmed: boolean;
  /** This slot is next off the line after the one running today — highlighted green. */
  isNext: boolean;
  isScheduleMutationPending: boolean;
  job: JobSummary | null;
  onAddIdle: (targetSlotId: string, placement: JobSlotPlacement) => void;
  onMove: (slotId: string, direction: JobSlotMoveDirection) => void;
  onRemove: (slotId: string) => Promise<void>;
  onResize: (slotId: string, durationDays: number) => void;
  onSelectSlot?: ((jobId: UUID, bayId: UUID) => void) | undefined;
  optimisticDurationDays: number | null;
  rowTop: number;
  slot: DisplayBaySlot;
  slotIndex: number;
  slotCount: number;
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}> = ({
  bayId,
  canEditSchedule,
  isDimmed,
  isNext,
  isScheduleMutationPending,
  job,
  onAddIdle,
  onMove,
  onRemove,
  onResize,
  onSelectSlot,
  optimisticDurationDays,
  rowTop,
  slot,
  slotIndex,
  slotCount,
  today,
  workingCalendar,
}) => {
  const gantt = useGanttContext();
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [resizeDrag, setResizeDrag] = useState<SlotResizeDrag | null>(null);
  const startDate = slot.startDate;
  const endDate = slot.endDate;
  const label = getSlotLabel(slot);
  const durationDays = slot.durationDays;
  const displayDurationDays = optimisticDurationDays ?? durationDays;
  const previewDurationDays = resizeDrag?.durationDays ?? displayDurationDays;
  const shouldProjectPreview = resizeDrag !== null || optimisticDurationDays !== null;
  const previewEndDate = useMemo(
    () => (shouldProjectPreview ? addJobSlotDuration(startDate, previewDurationDays, workingCalendar) : endDate),
    [endDate, previewDurationDays, shouldProjectPreview, startDate, workingCalendar],
  );
  const dayBreakdown = useMemo(
    () => summarizeSlotCalendarDays(startDate, previewEndDate, workingCalendar),
    [previewEndDate, startDate, workingCalendar],
  );
  const daySegments = useMemo(
    () => segmentSlotCalendarDays(startDate, previewEndDate, workingCalendar),
    [previewEndDate, startDate, workingCalendar],
  );
  const daySummary = formatSlotDaySummary(dayBreakdown);
  const left = getJobGanttOffset(startDate, gantt);
  const width = Math.max(getJobGanttWidth(startDate, previewEndDate, gantt) - SLOT_GAP, 28);
  const isIdle = slot.kind === 'idle';
  // The "active" slot is the booked job in progress on the plant's current business day.
  const isActive = !isIdle && startDate <= today && today < previewEndDate;
  // One tone drives both the slot border and its resize handle: today's job is blue (kept
  // off the app's primary yellow), the next slot off the line is green, everything else is
  // the neutral border.
  const tone: 'active' | 'next' | 'default' = isActive ? 'active' : isNext ? 'next' : 'default';
  const slotBorderClass = {
    active: 'border-blue-500/60 ring-1 ring-blue-500/25',
    default: 'border-border',
    next: 'border-emerald-500/70 ring-1 ring-emerald-500/25',
  }[tone];
  const resizeHandleToneClass = {
    active: 'border-blue-500/70 bg-blue-500/15 hover:bg-blue-500/25 focus-visible:ring-blue-500',
    default: 'border-foreground/30 bg-foreground/5 hover:bg-foreground/10 focus-visible:ring-ring',
    next: 'border-emerald-500/70 bg-emerald-500/15 hover:bg-emerald-500/25 focus-visible:ring-emerald-500',
  }[tone];
  const height = SLOT_CARD_HEIGHT;
  // Center the bar/card vertically within its (taller) bay row.
  const top = rowTop + (gantt.rowHeight - height) / 2;
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canEditSchedule || isScheduleMutationPending) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizeDrag({
      durationDays,
      initialDurationDays: durationDays,
      pixelsPerDay: getJobGanttResizeStepWidth(endDate, workingCalendar, gantt),
      startX: event.clientX,
    });
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeDrag) {
      return;
    }

    event.preventDefault();
    const deltaDays = Math.round((event.clientX - resizeDrag.startX) / resizeDrag.pixelsPerDay);
    const nextDurationDays = Math.max(1, resizeDrag.initialDurationDays + deltaDays);

    if (nextDurationDays !== resizeDrag.durationDays) {
      setResizeDrag({
        ...resizeDrag,
        durationDays: nextDurationDays,
      });
    }
  };
  const finishResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeDrag) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizeDrag(null);

    if (resizeDrag.durationDays !== durationDays) {
      onResize(slot.id, resizeDrag.durationDays);
    }
  };
  const cancelResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeDrag) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizeDrag(null);
  };
  const moveSlot = (direction: JobSlotMoveDirection) => {
    if (isScheduleMutationPending) {
      return;
    }

    onMove(slot.id, direction);
  };

  return (
    <HoverCard>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <HoverCardTrigger
              render={
                <div
                  data-gantt-drag-scroll-ignore
                  className={cn(
                    'pointer-events-auto absolute cursor-default overflow-hidden text-xs shadow-sm transition-opacity duration-200',
                    isIdle
                      ? cn('rounded-sm border-2 bg-card px-2 py-1 text-muted-foreground', slotBorderClass)
                      : cn('rounded-lg border-2 bg-card px-2.5 py-1.5 text-card-foreground', slotBorderClass),
                    // Filtered-out slots fade back but stay interactive; hover restores them.
                    isDimmed && 'opacity-20 hover:opacity-100',
                  )}
                  style={{
                    height,
                    left,
                    top,
                    width,
                  }}
                />
              }
            />
          }
        >
          {isIdle ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: IDLE_SLOT_HATCH_BACKGROUND }}
            />
          ) : (
            <BaySlotDayHatch segments={daySegments} slotStart={startDate} />
          )}
          {isIdle ? (
            <span className={cn('relative z-10 flex h-full items-center gap-1.5', canEditSchedule && 'pr-14')}>
              <span className="min-w-0 truncate font-medium">{label}</span>
              <span className="shrink-0 text-[0.65rem] tabular-nums opacity-80">{daySummary}</span>
            </span>
          ) : (
            <button
              className={cn(
                'relative z-10 block h-full w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                canEditSchedule && 'pr-14',
              )}
              disabled={!job || slot.previewSplit !== undefined}
              onClick={() => {
                if (job) {
                  onSelectSlot?.(job.id, bayId);
                }
              }}
              type="button"
            >
              <BaySlotJobCard dayBreakdown={dayBreakdown} job={job} jobCode={label} />
            </button>
          )}
          {canEditSchedule ? (
            <>
              <Dialog onOpenChange={setIsRemoveDialogOpen} open={isRemoveDialogOpen}>
                <DialogTrigger
                  render={
                    <button
                      aria-label={`Remove ${label}`}
                      className={cn(
                        'absolute top-1/2 right-4 z-20 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm bg-card/80 outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                        'hover:bg-destructive hover:text-white focus-visible:ring-ring',
                      )}
                      disabled={isScheduleMutationPending || isRemoving}
                      type="button"
                    />
                  }
                >
                  <IconTrash className="size-3.5" />
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Remove slot</DialogTitle>
                    <DialogDescription>
                      Remove {label} from the Bay schedule. Later Slots will move up to close the gap.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button disabled={isRemoving} type="button" variant="outline" />}>
                      Cancel
                    </DialogClose>
                    <Button
                      disabled={isRemoving}
                      onClick={async () => {
                        setIsRemoving(true);
                        try {
                          await onRemove(slot.id);
                          setIsRemoveDialogOpen(false);
                        } catch {
                          // The mutation hook owns the user-facing error toast.
                        } finally {
                          setIsRemoving(false);
                        }
                      }}
                      type="button"
                      variant="destructive"
                    >
                      {isRemoving ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
                      Remove
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <button
                aria-label={`Resize ${label}`}
                className={cn(
                  'absolute top-0 right-0 z-30 h-full w-3 cursor-ew-resize border-r-2 outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                  resizeHandleToneClass,
                )}
                disabled={isScheduleMutationPending || isRemoving}
                onPointerCancel={cancelResize}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishResize}
                type="button"
              />
            </>
          ) : null}
        </ContextMenuTrigger>
        {canEditSchedule ? (
          <ContextMenuContent>
            <ContextMenuGroup>
              <ContextMenuItem disabled={isScheduleMutationPending || slotIndex === 0} onClick={() => moveSlot('left')}>
                <IconArrowLeft />
                Move slot left
              </ContextMenuItem>
              <ContextMenuItem
                disabled={isScheduleMutationPending || slotIndex === slotCount - 1}
                onClick={() => moveSlot('right')}
              >
                <IconArrowRight />
                Move slot right
              </ContextMenuItem>
              <ContextMenuItem disabled={isScheduleMutationPending} onClick={() => onAddIdle(slot.id, 'before')}>
                <IconClockPlus />
                Add idle slot before
              </ContextMenuItem>
              <ContextMenuItem disabled={isScheduleMutationPending} onClick={() => onAddIdle(slot.id, 'after')}>
                <IconClockPlus />
                Add idle slot after
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        ) : null}
      </ContextMenu>
      <HoverCardContent align="start" className="flex w-64 flex-col gap-2" side="top">
        <p className="font-mono font-semibold">{label}</p>
        <InfoList>
          <SlotDayBreakdownRows dayBreakdown={dayBreakdown} endDate={previewEndDate} startDate={startDate} />
        </InfoList>
      </HoverCardContent>
    </HoverCard>
  );
};

// Total working days, with closure and overtime days called out in brackets
// (each only shown when non-zero), e.g. "5d (2 closed, 1 OT)".
function formatSlotDaySummary({ workingDays, closureDays, overtimeDays }: SlotCalendarDays): string {
  const extras: string[] = [];

  if (closureDays > 0) {
    extras.push(`${closureDays} closed`);
  }

  if (overtimeDays > 0) {
    extras.push(`${overtimeDays} OT`);
  }

  const days = `${workingDays}d`;
  return extras.length > 0 ? `${days} (${extras.join(', ')})` : days;
}

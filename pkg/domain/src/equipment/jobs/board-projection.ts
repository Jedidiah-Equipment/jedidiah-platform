import type {
  BayCalendarExceptionDirection,
  DateOnlyIso,
  JobSlotState,
  ProjectedIdleJobSlot,
  ProjectedJobSlot,
  ProjectedWorkJobSlot,
} from '@pkg/schema';

import { bayWorkingCalendars } from './bay-working-calendars.js';
import { type InsertAtDatePlacement, resolveInsertAtDatePlacement } from './job-slot-insert-at-date.js';
import { addJobSlotDuration, labelWorkDays, projectJobSlots } from './job-slot-projection.js';
import { firstWorkingDayOnOrAfter, type WorkingCalendar } from './working-calendar.js';

type OffDayFact = { date: string };
type CalendarExceptionFact = { date: string; direction: BayCalendarExceptionDirection };

export type ProjectableBoardWorkSlot = Omit<
  ProjectedWorkJobSlot,
  'endDate' | 'firstWorkDay' | 'jobUnfinished' | 'lastWorkDay' | 'previewSplit' | 'startDate' | 'state'
>;
export type ProjectableBoardIdleSlot = Omit<
  ProjectedIdleJobSlot,
  'endDate' | 'firstWorkDay' | 'lastWorkDay' | 'previewSplit' | 'startDate' | 'state'
>;
export type ProjectableBoardSlot = ProjectableBoardWorkSlot | ProjectableBoardIdleSlot;

export type BoardSeed = {
  bayId: string;
  /** Always a valid integer >= 1; form rows and wire input reject invalid draft durations first. */
  durationDays: number;
  /** Missing means plain append; present means Insert-at-Date resolution. */
  startDate?: DateOnlyIso | undefined;
};

export type BoardGhost = {
  bayId: string;
  durationDays: number;
  endDate: DateOnlyIso;
  firstWorkDay: DateOnlyIso;
  id: string;
  lastWorkDay: DateOnlyIso;
  placementType: BoardPlacementType;
  seedIndex: number;
  startDate: DateOnlyIso;
};

export type BoardGhostTarget = {
  id: string;
  seedIndex: number;
};

export type BoardPlacement =
  | { type: 'append'; startDate: DateOnlyIso; idleGapDays: number }
  // `type` alone cannot separate the two insert-before variants, so they carry an explicit
  // `targetKind` discriminant; consumers read it instead of sniffing for a target key.
  | { type: 'insert-before'; targetKind: 'slot'; startDate: DateOnlyIso; targetSlot: ProjectedJobSlot }
  | { type: 'insert-before'; targetKind: 'ghost'; startDate: DateOnlyIso; targetGhost: BoardGhostTarget }
  | {
      type: 'split';
      startDate: DateOnlyIso;
      targetSlot: ProjectedJobSlot;
      beforeDays: number;
      afterDays: number;
    };

export type BoardPlacementType = BoardPlacement['type'];

export type BoardBayFacts = {
  id: string;
  scheduleOrigin: DateOnlyIso;
  calendarExceptions: readonly CalendarExceptionFact[];
  /** Stored queue facts in sequence order, with jobId/jobCode already resolved by the caller. */
  slots: readonly ProjectableBoardSlot[];
};

export type ProjectedBoardBay = {
  bayId: string;
  nextAvailableDate: DateOnlyIso;
  slots: (ProjectedWorkJobSlot | ProjectedIdleJobSlot)[];
  workingCalendar: WorkingCalendar;
};

export type ProjectedBoard = {
  bays: ProjectedBoardBay[];
  ghosts: BoardGhost[];
  placements: BoardPlacement[];
};

export function projectBoard({
  bays,
  offDays,
  seeds = [],
  today,
}: {
  bays: readonly BoardBayFacts[];
  offDays: readonly OffDayFact[];
  seeds?: readonly BoardSeed[];
  today: DateOnlyIso;
}): ProjectedBoard {
  const workingCalendars = bayWorkingCalendars(bays, offDays);
  const seedsByBayId = groupSeedsByBayId(seeds);
  const ghosts: BoardGhost[] = [];
  const internalPlacementsBySeedIndex = new Map<number, InternalBoardPlacement>();

  const rawProjectedBays = bays.map((bay) => {
    const workingCalendar = workingCalendars.get(bay.id) ?? {};
    const baySeeds = seedsByBayId.get(bay.id) ?? [];
    const projection =
      baySeeds.length > 0
        ? projectSeededBay({ bay, seeds: baySeeds, today, workingCalendar })
        : projectPlainBay({ bay, workingCalendar });

    for (const ghost of projection.ghosts) {
      ghosts.push(ghost);
    }

    for (const [seedIndex, placement] of projection.placementsBySeedIndex) {
      internalPlacementsBySeedIndex.set(seedIndex, placement);
    }

    return {
      bayId: bay.id,
      nextAvailableDate: projection.nextAvailableDate,
      slots: projection.slots,
      workingCalendar,
    };
  });

  const unfinishedJobIds = new Set<string>();
  for (const bay of rawProjectedBays) {
    for (const slot of bay.slots) {
      if (slot.kind === 'work' && slot.endDate > today) {
        unfinishedJobIds.add(slot.jobId);
      }
    }
  }

  const decorate = (slot: ProjectedRealBoardEntry) =>
    decorateBoardSlot(slot, {
      today,
      unfinishedJobIds,
    });
  const placements = seeds.map((_seed, seedIndex) => {
    const placement = internalPlacementsBySeedIndex.get(seedIndex);

    if (!placement) {
      throw new Error(`Board seed ${seedIndex} did not resolve to a placement`);
    }

    return decorateBoardPlacement(placement, decorate);
  });

  return {
    bays: rawProjectedBays.map((bay) => ({
      ...bay,
      slots: bay.slots.map(decorate),
    })),
    ghosts: [...ghosts].sort((left, right) => left.seedIndex - right.seedIndex),
    placements,
  };
}

export function slotState(
  slot: Pick<ProjectedWorkJobSlot | ProjectedIdleJobSlot, 'endDate' | 'startDate'>,
  today: DateOnlyIso,
): JobSlotState {
  if (slot.endDate <= today) return 'done';
  if (slot.startDate <= today) return 'active';

  return 'scheduled';
}

type IndexedBoardSeed = {
  seed: BoardSeed;
  seedIndex: number;
};

type BoardSlotSplitMarker = { sourceSlotId: string; half: 'before' | 'after' };

type ProjectableRealBoardEntry = ProjectableBoardSlot & {
  ghostMeta?: undefined;
  splitOf?: BoardSlotSplitMarker;
};

type BoardGhostEntry = {
  durationDays: number;
  ghostMeta: GhostEntryMeta;
  id: string;
  sequence: number;
  splitOf?: undefined;
};

type WorkingEntry = ProjectableRealBoardEntry | BoardGhostEntry;
type ProjectedWorkingEntry = WorkingEntry & {
  endDate: DateOnlyIso;
  firstWorkDay: DateOnlyIso;
  lastWorkDay: DateOnlyIso;
  startDate: DateOnlyIso;
};
type ProjectedRealBoardEntry = ProjectedWorkingEntry & ProjectableRealBoardEntry;

type GhostEntryMeta = {
  bayId: string;
  seedIndex: number;
  placementType: BoardPlacementType;
  /** The resolver's append start, kept to clamp a trailing ghost past a stale queue end. */
  appendStart: DateOnlyIso | null;
};

type InternalBoardPlacement =
  | { type: 'append'; startDate: DateOnlyIso; idleGapDays: number }
  | { type: 'insert-before'; targetKind: 'slot'; startDate: DateOnlyIso; slot: ProjectedRealBoardEntry }
  | { type: 'insert-before'; targetKind: 'ghost'; startDate: DateOnlyIso; targetGhost: BoardGhostTarget }
  | {
      type: 'split';
      startDate: DateOnlyIso;
      slot: ProjectedRealBoardEntry;
      beforeDays: number;
      afterDays: number;
    };

type BayProjectionResult = {
  ghosts: BoardGhost[];
  nextAvailableDate: DateOnlyIso;
  placementsBySeedIndex: Map<number, InternalBoardPlacement>;
  slots: ProjectedRealBoardEntry[];
};

function groupSeedsByBayId(seeds: readonly BoardSeed[]): Map<string, IndexedBoardSeed[]> {
  const grouped = new Map<string, IndexedBoardSeed[]>();

  for (const [seedIndex, seed] of seeds.entries()) {
    const existing = grouped.get(seed.bayId) ?? [];
    existing.push({ seed, seedIndex });
    grouped.set(seed.bayId, existing);
  }

  return grouped;
}

function projectPlainBay({
  bay,
  workingCalendar,
}: {
  bay: BoardBayFacts;
  workingCalendar: WorkingCalendar;
}): BayProjectionResult {
  const projection = projectJobSlots<ProjectableRealBoardEntry>({
    scheduleOrigin: bay.scheduleOrigin,
    slots: bay.slots,
    workingCalendar,
  });

  return {
    ghosts: [],
    nextAvailableDate: projection.nextAvailableDate,
    placementsBySeedIndex: new Map(),
    slots: projection.slots,
  };
}

function projectSeededBay({
  bay,
  seeds,
  today,
  workingCalendar,
}: {
  bay: BoardBayFacts;
  seeds: readonly IndexedBoardSeed[];
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}): BayProjectionResult {
  let entries: WorkingEntry[] = [...bay.slots];
  const placementsBySeedIndex = new Map<number, InternalBoardPlacement>();

  for (const { seed, seedIndex } of seeds) {
    const result = spliceSeedEntry({
      bay,
      entries,
      seed,
      seedIndex,
      today,
      workingCalendar,
    });
    entries = result.entries;
    placementsBySeedIndex.set(seedIndex, result.placement);
  }

  const projection = projectJobSlots<WorkingEntry>({
    scheduleOrigin: bay.scheduleOrigin,
    slots: entries,
    workingCalendar,
  });
  const slots: ProjectedRealBoardEntry[] = [];
  const ghosts: BoardGhost[] = [];

  for (const [index, projected] of projection.slots.entries()) {
    if (!isProjectedGhostEntry(projected)) {
      slots.push(projected);
      continue;
    }

    // A trailing append ghost clamps forward when the queue ended in the past: the server fills that
    // gap with idle, so the previewed Work Slot never starts stale.
    const isTrailing = index === projection.slots.length - 1;
    const clampedStart =
      isTrailing && projected.ghostMeta.appendStart && projected.ghostMeta.appendStart > projected.startDate
        ? projected.ghostMeta.appendStart
        : projected.startDate;
    const endDate =
      clampedStart === projected.startDate
        ? projected.endDate
        : addJobSlotDuration(clampedStart, projected.durationDays, workingCalendar);

    ghosts.push({
      bayId: projected.ghostMeta.bayId,
      durationDays: projected.durationDays,
      endDate,
      ...labelWorkDays(clampedStart, endDate, workingCalendar),
      id: boardGhostId(projected.ghostMeta.bayId, projected.ghostMeta.seedIndex),
      placementType: projected.ghostMeta.placementType,
      seedIndex: projected.ghostMeta.seedIndex,
      startDate: clampedStart,
    });
  }

  return { ghosts, nextAvailableDate: projection.nextAvailableDate, placementsBySeedIndex, slots };
}

function spliceSeedEntry({
  bay,
  entries,
  seed,
  seedIndex,
  today,
  workingCalendar,
}: {
  bay: BoardBayFacts;
  entries: WorkingEntry[];
  seed: BoardSeed;
  seedIndex: number;
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}): { entries: WorkingEntry[]; placement: InternalBoardPlacement } {
  const placement = resolveInsertAtDatePlacement({
    currentDate: today,
    pickedDate: seed.startDate,
    scheduleOrigin: bay.scheduleOrigin,
    slots: entries,
    workingCalendar,
  });
  // A pick landing inside an earlier seed's ghost has no stored Slot to halve, so it degrades to
  // insert-before. The ghost records that resolved type, never an unrepresentable ghost split.
  const targetsGhost = placement.type !== 'append' && Boolean(placement.targetSlot.ghostMeta);
  const ghostEntry: WorkingEntry = {
    durationDays: seed.durationDays,
    ghostMeta: {
      appendStart: placement.type === 'append' ? placement.startDate : null,
      bayId: bay.id,
      placementType: targetsGhost ? 'insert-before' : placement.type,
      seedIndex,
    },
    id: `seed:${seedIndex}`,
    sequence: entries.length + 1,
  };
  const next = [...entries];

  if (placement.type === 'append') {
    next.push(ghostEntry);
  } else {
    const targetIndex = next.findIndex((entry) => entry.id === placement.targetSlot.id);
    const target = targetIndex >= 0 ? next[targetIndex] : undefined;

    if (!target) {
      next.push(ghostEntry);
    } else if (placement.type === 'insert-before' || target.ghostMeta) {
      // Splitting another ghost has no real Slot to halve; degrade to insert-before.
      next.splice(targetIndex, 0, ghostEntry);
    } else {
      // Each half takes a unique id so a later seed targeting one half resolves to it, not its twin.
      next.splice(
        targetIndex,
        1,
        {
          ...target,
          durationDays: placement.beforeDays,
          id: `${target.id}:before`,
          splitOf: { half: 'before', sourceSlotId: target.id },
        },
        ghostEntry,
        {
          ...target,
          durationDays: placement.afterDays,
          id: `${target.id}:after`,
          splitOf: { half: 'after', sourceSlotId: target.id },
        },
      );
    }
  }

  // Renumbering keeps projectJobSlots' sort deterministic (it tiebreaks equal sequences by id, which
  // would otherwise shuffle the split halves around the ghost).
  return {
    entries: next.map((entry, index) => ({ ...entry, sequence: index + 1 })),
    placement: toInternalBoardPlacement(placement, bay.id, workingCalendar),
  };
}

function toInternalBoardPlacement(
  placement: InsertAtDatePlacement<WorkingEntry>,
  bayId: string,
  workingCalendar: WorkingCalendar,
): InternalBoardPlacement {
  if (placement.type === 'append') {
    return { type: 'append', idleGapDays: placement.idleGapDays, startDate: placement.startDate };
  }

  if (isProjectedGhostEntry(placement.targetSlot)) {
    // A ghost has no stored Slot to halve, so the entry splice inserts before it rather than splitting.
    return {
      startDate: firstWorkingDayOnOrAfter(placement.targetSlot.startDate, workingCalendar),
      targetGhost: {
        id: boardGhostId(bayId, placement.targetSlot.ghostMeta.seedIndex),
        seedIndex: placement.targetSlot.ghostMeta.seedIndex,
      },
      targetKind: 'ghost',
      type: 'insert-before',
    };
  }

  return placement.type === 'insert-before'
    ? { slot: placement.targetSlot, startDate: placement.startDate, targetKind: 'slot', type: 'insert-before' }
    : {
        afterDays: placement.afterDays,
        beforeDays: placement.beforeDays,
        slot: placement.targetSlot,
        startDate: placement.startDate,
        type: 'split',
      };
}

function decorateBoardSlot(
  slot: ProjectedRealBoardEntry,
  {
    today,
    unfinishedJobIds,
  }: {
    today: DateOnlyIso;
    unfinishedJobIds: ReadonlySet<string>;
  },
): ProjectedJobSlot {
  const { ghostMeta: _ghostMeta, splitOf, ...rest } = slot;
  const id = splitOf ? `${splitOf.sourceSlotId}:${splitOf.half}` : rest.id;
  const state = slotState(rest, today);
  const previewSplit = splitOf ? { half: splitOf.half, sourceSlotId: splitOf.sourceSlotId } : undefined;

  return rest.kind === 'work'
    ? {
        ...rest,
        id,
        jobUnfinished: unfinishedJobIds.has(rest.jobId),
        state,
        ...(previewSplit ? { previewSplit } : {}),
      }
    : {
        ...rest,
        id,
        state,
        ...(previewSplit ? { previewSplit } : {}),
      };
}

function decorateBoardPlacement(
  placement: InternalBoardPlacement,
  decorate: (slot: ProjectedRealBoardEntry) => ProjectedJobSlot,
): BoardPlacement {
  if (placement.type === 'append') {
    return placement;
  }

  if (placement.type === 'insert-before' && placement.targetKind === 'ghost') {
    return placement;
  }

  return placement.type === 'insert-before'
    ? {
        startDate: placement.startDate,
        targetKind: placement.targetKind,
        targetSlot: decorate(placement.slot),
        type: placement.type,
      }
    : {
        afterDays: placement.afterDays,
        beforeDays: placement.beforeDays,
        startDate: placement.startDate,
        targetSlot: decorate(placement.slot),
        type: placement.type,
      };
}

function isProjectedGhostEntry(slot: ProjectedWorkingEntry): slot is ProjectedWorkingEntry & BoardGhostEntry {
  return slot.ghostMeta !== undefined;
}

function boardGhostId(bayId: string, seedIndex: number): string {
  return `ghost:${bayId}:${seedIndex}`;
}

import {
  createEscapedContainsSearchCondition,
  type customers,
  type DatabaseTransaction,
  type Db,
  documents,
  getPaginationQueryOptions,
  jobBayCalendarExceptions,
  jobBayOperatorAssignments,
  jobBays,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
  jobs,
  parts,
  products,
  type quotes,
  user,
} from '@pkg/db';
import {
  addDateOnlyDays,
  type BayPlacement,
  bayWorkingCalendars,
  countWorkingDaysBetween,
  deriveJobRouteStopState,
  getPlantDateNow,
  JOB_DEPARTMENT_PIPELINE,
  type PreviewBaySlot,
  parseJobCodeSearch,
  previewBaySchedule,
  projectJobSlots,
  type WorkingCalendar,
} from '@pkg/domain';
import {
  Bay,
  type BayListInput,
  type BayListResult,
  BaySchedule,
  type DateOnlyIso,
  type JobDepartmentSchedule,
  type JobDetail,
  JobDocument,
  type JobListInput,
  type JobListResult,
  JobSchedulePreviewBay,
  type JobSchedulePreviewGhost,
  type JobSchedulePreviewInput,
  type JobSchedulePreviewPlacement,
  JobSchedulePreviewResult,
  JobSchedulePreviewSlot,
  type JobScheduleState,
  type JobSortBy,
  type JobSummary,
  type OffDay,
  ProjectedJobSlot,
  QuoteCode,
  type SortDirection,
  UUID,
} from '@pkg/schema';
import { and, asc, desc, eq, gte, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { DocumentNotFoundError } from '../documents/document-errors.js';
import {
  type DocumentSummaryRow,
  documentBaseSelect,
  mapDocumentSummary,
  type ReadDocumentResult,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { getCurrentBayOperator, type OpenOperatorAssignmentsRow } from './job-bay-service.js';
import { JobBayNotFoundError, JobNotFoundError } from './job-errors.js';
import { type JobRow, mapJob } from './job-mappers.js';
import { listWorkingCalendarOffDays } from './working-calendar-service.js';

const SCHEDULE_HISTORY_WINDOW_DAYS = 365;

type ProductRow = Pick<typeof products.$inferSelect, 'modelCode' | 'name' | 'thumbnailDataUrl'>;
type CustomerRow = Pick<typeof customers.$inferSelect, 'companyName' | 'id' | 'thumbnailDataUrl'>;
type QuoteRow = Pick<typeof quotes.$inferSelect, 'code'> & {
  customer: CustomerRow;
};

type JobWithProductRow = JobRow & {
  product: ProductRow;
  quote: QuoteRow;
};

type JobDocumentRow = DocumentSummaryRow & {
  sourceProductName: string | null;
};

type BayCalendarExceptionRow = Pick<
  typeof jobBayCalendarExceptions.$inferSelect,
  'bayId' | 'date' | 'direction' | 'label'
>;

type BayScheduleRow = typeof jobBays.$inferSelect &
  OpenOperatorAssignmentsRow & {
    calendarExceptions: BayCalendarExceptionRow[];
    slots: (typeof jobSlots.$inferSelect & {
      job: Pick<typeof jobs.$inferSelect, 'code' | 'id'> | null;
    })[];
  };

export type BayQueueAvailability = {
  bayId: UUID;
  department: BaySchedule['department'];
  name: BaySchedule['name'];
  nextAvailableDate: BaySchedule['nextAvailableDate'];
  waitWorkingDays: number;
};

// Any `job:read` user sees the full cross-department schedule, so bay reads are not department-scoped.
function findBayScheduleRows(db: Db | DatabaseTransaction, where?: SQL) {
  return db.query.jobBays.findMany({
    where,
    orderBy: [asc(jobBays.department), asc(jobBays.name), asc(jobBays.id)],
    with: {
      operatorAssignments: {
        columns: {},
        where: isNull(jobBayOperatorAssignments.unassignedAt),
        with: {
          operator: {
            columns: { email: true, id: true, image: true, name: true },
          },
        },
      },
      calendarExceptions: {
        columns: {
          bayId: true,
          date: true,
          direction: true,
          label: true,
        },
        orderBy: [asc(jobBayCalendarExceptions.date)],
      },
      slots: {
        orderBy: [asc(jobSlots.sequence), asc(jobSlots.id)],
        with: {
          job: {
            columns: {
              code: true,
              id: true,
            },
          },
        },
      },
    },
  });
}

function toBaySchedules(rows: BayScheduleRow[], offDays: readonly OffDay[]): BaySchedule[] {
  const workingCalendars = bayWorkingCalendars(rows, offDays);

  return rows.map((row) => mapBaySchedule(row, workingCalendars.get(row.id) ?? {}));
}

export async function listBays({
  db,
  input,
}: {
  db: Db | DatabaseTransaction;
  input?: BayListInput | undefined;
}): Promise<BayListResult> {
  const [offDays, rows] = await Promise.all([listWorkingCalendarOffDays(db), findBayScheduleRows(db)]);
  const today = getPlantDateNow();
  const items = windowBayScheduleSlots(toBaySchedules(rows, offDays), {
    from: resolveScheduleWindowFrom(input, today),
    today,
  });

  // Resolve product/customer detail only for the Jobs actually on the board (one summary per Job, even
  // when it spans several Bays), so clients label Slots without an unpaged full-Jobs read.
  const scheduledJobIds = getScheduleJobIds(items);

  return {
    items,
    jobs: await listJobSummariesByIds({ db, jobIds: scheduledJobIds }),
    offDays,
    // Plant "today" enters here, at the server boundary — the client never derives it.
    today,
  };
}

export async function previewJobSchedule({
  db,
  input,
}: {
  db: Db | DatabaseTransaction;
  input: JobSchedulePreviewInput;
}): Promise<JobSchedulePreviewResult> {
  if (input.seeds.length === 0) {
    return JobSchedulePreviewResult.parse({ bays: [], ghosts: [], placements: [] });
  }

  const bayIds = [...new Set(input.seeds.map((seed) => seed.bayId))];
  const [offDays, rows] = await Promise.all([listWorkingCalendarOffDays(db), findBayScheduleRows(db)]);
  const rowIds = new Set(rows.map((row) => row.id));
  const missingBayId = bayIds.find((bayId) => !rowIds.has(bayId));

  if (missingBayId) {
    throw new JobBayNotFoundError(missingBayId);
  }

  const today = getPlantDateNow();
  const seedsByBayId = groupPreviewSeedsByBayId(input.seeds);
  const placementsBySeedIndex = new Map<number, JobSchedulePreviewPlacement>();
  const ghosts: JobSchedulePreviewGhost[] = [];
  const previewBaysById = new Map<UUID, JobSchedulePreviewBay>();
  const baseBays = toBaySchedules(rows, offDays);

  for (const bay of baseBays) {
    const indexedSeeds = seedsByBayId.get(bay.id);

    if (!indexedSeeds || indexedSeeds.length === 0) {
      continue;
    }

    const result = previewBaySchedule(bay, offDays, {
      kind: 'insertSeeds',
      seeds: indexedSeeds.map(({ seed }) => ({ durationDays: seed.durationDays, startDate: seed.startDate ?? '' })),
      today,
    });

    for (const [baySeedIndex, placement] of result.placements.entries()) {
      const seedIndex = indexedSeeds[baySeedIndex]?.seedIndex;

      if (seedIndex !== undefined) {
        placementsBySeedIndex.set(
          seedIndex,
          toSchedulePreviewPlacement(placement, {
            bayId: bay.id,
            toPublicSeedIndex: (localSeedIndex) => indexedSeeds[localSeedIndex]?.seedIndex ?? localSeedIndex,
          }),
        );
      }
    }

    for (const ghost of result.ghosts) {
      const seedIndex = indexedSeeds[ghost.seedIndex]?.seedIndex ?? ghost.seedIndex;

      ghosts.push({
        bayId: bay.id,
        durationDays: ghost.durationDays,
        endDate: ghost.endDate,
        id: `ghost:${bay.id}:${seedIndex}`,
        placementType: ghost.placementType,
        seedIndex,
        startDate: ghost.startDate,
      });
    }

    previewBaysById.set(
      bay.id,
      JobSchedulePreviewBay.parse({
        ...bay,
        nextAvailableDate: result.nextAvailableDate,
        slots: result.slots.map(toSchedulePreviewSlot),
      }),
    );
  }

  const placements = input.seeds.map((_seed, seedIndex) => {
    const placement = placementsBySeedIndex.get(seedIndex);

    if (!placement) {
      throw new Error('Schedule preview placement was not resolved for every seed');
    }

    return placement;
  });

  const windowedBays = windowBayScheduleSlots(
    baseBays.map((bay) => previewBaysById.get(bay.id) ?? bay),
    {
      from: resolveScheduleWindowFrom(input, today),
      today,
    },
  );
  const previewBays = windowedBays
    .filter((bay) => previewBaysById.has(bay.id))
    .map((bay) => JobSchedulePreviewBay.parse(bay));

  return JobSchedulePreviewResult.parse({ bays: previewBays, ghosts, placements });
}

type WindowableScheduleSlot =
  | { endDate: DateOnlyIso; jobId: UUID; kind: 'work' }
  | { endDate: DateOnlyIso; jobId: null; kind: 'idle' };

function resolveScheduleWindowFrom(
  input: BayListInput | JobSchedulePreviewInput | undefined,
  today: DateOnlyIso,
): DateOnlyIso {
  const earliestFrom = addDateOnlyDays(today, -SCHEDULE_HISTORY_WINDOW_DAYS);
  const requestedFrom = input?.from ?? today;

  return requestedFrom < earliestFrom ? earliestFrom : requestedFrom;
}

function windowBayScheduleSlots<TBay extends { slots: readonly WindowableScheduleSlot[] }>(
  bays: readonly TBay[],
  {
    from,
    today,
  }: {
    from: DateOnlyIso;
    today: DateOnlyIso;
  },
): TBay[] {
  const unfinishedJobIds = getUnfinishedScheduleJobIds(bays, today);

  return bays.map(
    (bay) =>
      ({
        ...bay,
        slots: bay.slots.filter((slot) => isScheduleSlotInWindow(slot, { from, today, unfinishedJobIds })),
      }) as TBay,
  );
}

function getUnfinishedScheduleJobIds(
  bays: readonly { slots: readonly WindowableScheduleSlot[] }[],
  today: DateOnlyIso,
): Set<UUID> {
  const jobIds = new Set<UUID>();

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind === 'work' && slot.endDate > today) {
        jobIds.add(slot.jobId);
      }
    }
  }

  return jobIds;
}

function isScheduleSlotInWindow(
  slot: WindowableScheduleSlot,
  {
    from,
    today,
    unfinishedJobIds,
  }: {
    from: DateOnlyIso;
    today: DateOnlyIso;
    unfinishedJobIds: ReadonlySet<UUID>;
  },
): boolean {
  if (slot.kind === 'work' && unfinishedJobIds.has(slot.jobId)) {
    return true;
  }

  if (from < today) {
    return slot.endDate >= from;
  }

  // Slot spans are half-open; `endDate === today` has already left the default Active Board.
  return slot.endDate > today;
}

function getScheduleJobIds(bays: readonly { slots: readonly WindowableScheduleSlot[] }[]): UUID[] {
  const jobIds = new Set<UUID>();

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind === 'work') {
        jobIds.add(slot.jobId);
      }
    }
  }

  return [...jobIds];
}

// Cap the IN list per query so a long-lived board with many historical slotted Jobs never binds past
// PostgreSQL's parameter limit (~65k) — which would fail the whole `listBays` read, not just enlarge it.
const JOB_SUMMARY_LOOKUP_BATCH_SIZE = 1000;

async function listJobSummariesByIds({
  db,
  jobIds,
}: {
  db: Db | DatabaseTransaction;
  jobIds: readonly UUID[];
}): Promise<JobSummary[]> {
  const summaries: JobSummary[] = [];

  for (let start = 0; start < jobIds.length; start += JOB_SUMMARY_LOOKUP_BATCH_SIZE) {
    const batch = jobIds.slice(start, start + JOB_SUMMARY_LOOKUP_BATCH_SIZE);
    const rows = await db.query.jobs.findMany({
      columns: {
        createdAt: true,
        id: true,
        code: true,
        productId: true,
        productSerialNumber: true,
        productSerialPrefix: true,
        productSerialSequence: true,
        productSerialYear: true,
        quoteId: true,
        updatedAt: true,
        vinNumber: true,
      },
      where: inArray(jobs.id, batch),
      with: {
        product: {
          columns: {
            modelCode: true,
            name: true,
            thumbnailDataUrl: true,
          },
        },
        quote: {
          columns: {
            code: true,
          },
          with: {
            customer: {
              columns: {
                companyName: true,
                id: true,
                thumbnailDataUrl: true,
              },
            },
          },
        },
      },
    });

    for (const row of rows) {
      summaries.push(mapJobSummary(row));
    }
  }

  return summaries;
}

export async function listBayQueueAvailability({
  bayIds,
  db,
}: {
  bayIds: readonly UUID[];
  db: Db | DatabaseTransaction;
}): Promise<BayQueueAvailability[]> {
  if (bayIds.length === 0) {
    return [];
  }

  const [offDays, rows] = await Promise.all([
    listWorkingCalendarOffDays(db),
    findBayScheduleRows(db, inArray(jobBays.id, bayIds)),
  ]);
  const workingCalendars = bayWorkingCalendars(rows, offDays);
  const today = getPlantDateNow();

  return rows.map((row) => {
    const workingCalendar = workingCalendars.get(row.id) ?? {};
    const schedule = mapBaySchedule(row, workingCalendar);

    return {
      bayId: schedule.id,
      department: schedule.department,
      name: schedule.name,
      nextAvailableDate: schedule.nextAvailableDate,
      waitWorkingDays: countWorkingDaysBetween(today, schedule.nextAvailableDate, workingCalendar),
    };
  });
}

// Projecting a Job's schedule only needs the bays that actually hold one of its Work Slots — the only
// queues whose reflow can move that Job's Slot dates. An inline subquery restricts the projection to
// those bays rather than a separate round trip or the whole shop floor; Idle Slots carry a null jobId,
// so matching on jobId already scopes to Work Slots. Off-Days load in parallel since they don't depend
// on which bays match.
async function findProjectedBaysForJobs({
  db,
  jobIds,
}: {
  db: Db | DatabaseTransaction;
  jobIds: readonly UUID[];
}): Promise<BaySchedule[]> {
  const bayIds = db
    .selectDistinct({ bayId: jobSlots.bayId })
    .from(jobSlots)
    .where(inArray(jobSlots.jobId, [...jobIds]));
  const [offDays, rows] = await Promise.all([
    listWorkingCalendarOffDays(db),
    findBayScheduleRows(db, inArray(jobBays.id, bayIds)),
  ]);

  return toBaySchedules(rows, offDays);
}

async function getJobSchedule({
  db,
  jobId,
}: {
  db: Db | DatabaseTransaction;
  jobId: UUID;
}): Promise<JobDepartmentSchedule[]> {
  return mapJobSchedule({ bays: await findProjectedBaysForJobs({ db, jobIds: [jobId] }), jobId });
}

export async function listJobs({ db, input }: { db: Db; input: JobListInput }): Promise<JobListResult> {
  const where = buildJobListWhere(input);
  const orderBy = getJobSortOrder(input.sortBy, input.sortDirection);

  const rows = await db.query.jobs.findMany({
    columns: {
      createdAt: true,
      id: true,
      code: true,
      productId: true,
      productSerialNumber: true,
      productSerialPrefix: true,
      productSerialSequence: true,
      productSerialYear: true,
      quoteId: true,
      updatedAt: true,
      vinNumber: true,
    },
    where,
    orderBy: [orderBy, asc(jobs.id)],
    ...getPaginationQueryOptions(input),
    with: {
      product: {
        columns: {
          modelCode: true,
          name: true,
          thumbnailDataUrl: true,
        },
      },
      quote: {
        columns: {
          code: true,
        },
        with: {
          customer: {
            columns: {
              companyName: true,
              id: true,
              thumbnailDataUrl: true,
            },
          },
        },
      },
    },
  });

  const total = await db.$count(jobs, where);

  // Schedule-state is a Slot projection, so it is computed only when a caller opts in and only for
  // the returned page — the Gantt and BookSlotDialog share this read and must stay projection-free.
  const scheduleStates = input.include?.scheduleState
    ? await computeJobScheduleStates({ db, jobIds: rows.map((row) => UUID.parse(row.id)) })
    : null;

  return {
    items: rows.map((row) => mapJobSummary(row, scheduleStates?.get(UUID.parse(row.id)) ?? null)),
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
    total,
  };
}

/**
 * Buckets each Job's Work Slots into `done/active/scheduled` against plant "today". The classification
 * is calendar-independent — it reads the already-projected Slot span — so this only needs the projected
 * bays, not their working calendars. The caller restricts `jobIds` to a single page; every requested Job
 * is present in the result, with all-zero counts when it has no Work Slot.
 */
async function computeJobScheduleStates({
  db,
  jobIds,
}: {
  db: Db;
  jobIds: readonly UUID[];
}): Promise<Map<UUID, JobScheduleState>> {
  const states = new Map<UUID, JobScheduleState>(
    jobIds.map((jobId) => [jobId, { active: 0, done: 0, endDate: null, scheduled: 0, startDate: null, total: 0 }]),
  );

  if (jobIds.length === 0) {
    return states;
  }

  const today = getPlantDateNow();

  for (const bay of await findProjectedBaysForJobs({ db, jobIds })) {
    for (const slot of bay.slots) {
      if (slot.kind !== 'work') continue;
      const state = states.get(slot.jobId);
      if (!state) continue;

      state[deriveJobRouteStopState({ slot, today })] += 1;
      state.total += 1;
      // Earliest Slot start / latest Slot end across every Bay the Job spans.
      state.startDate = state.startDate === null || slot.startDate < state.startDate ? slot.startDate : state.startDate;
      state.endDate = state.endDate === null || slot.endDate > state.endDate ? slot.endDate : state.endDate;
    }
  }

  return states;
}

function mapBaySchedule(row: BayScheduleRow, workingCalendar: WorkingCalendar) {
  const bay = Bay.parse({ ...row, currentOperator: getCurrentBayOperator(row) });
  const projection = projectJobSlots({
    scheduleOrigin: bay.scheduleOrigin,
    slots: row.slots,
    workingCalendar,
  });

  return BaySchedule.parse({
    ...bay,
    calendarExceptions: row.calendarExceptions,
    nextAvailableDate: projection.nextAvailableDate,
    slots: projection.slots.map((slot) => {
      if (slot.kind === 'idle') {
        return ProjectedJobSlot.parse(slot);
      }

      if (!slot.job) {
        throw new Error('Work Job slot was missing its Job relation');
      }

      return ProjectedJobSlot.parse({
        ...slot,
        jobCode: slot.job.code,
        jobId: slot.job.id,
      });
    }),
  });
}

function groupPreviewSeedsByBayId(seeds: JobSchedulePreviewInput['seeds']) {
  const grouped = new Map<UUID, { seed: JobSchedulePreviewInput['seeds'][number]; seedIndex: number }[]>();

  for (const [seedIndex, seed] of seeds.entries()) {
    const existing = grouped.get(seed.bayId) ?? [];
    existing.push({ seed, seedIndex });
    grouped.set(seed.bayId, existing);
  }

  return grouped;
}

function toSchedulePreviewPlacement(
  placement: BayPlacement,
  options: { bayId: UUID; toPublicSeedIndex: (localSeedIndex: number) => number },
): JobSchedulePreviewPlacement {
  if (placement.type === 'append') {
    return {
      idleGapDays: placement.idleGapDays,
      startDate: placement.startDate,
      type: placement.type,
    };
  }

  if (placement.type === 'insert-before') {
    const targetGhost = toSchedulePreviewGhostTarget(placement.targetSlot, options);

    if (targetGhost) {
      return {
        startDate: placement.startDate,
        targetGhost,
        type: placement.type,
      };
    }

    return {
      startDate: placement.startDate,
      targetSlot: toSchedulePreviewSlot(placement.targetSlot as PreviewBaySlot),
      type: placement.type,
    };
  }

  const targetGhost = toSchedulePreviewGhostTarget(placement.targetSlot, options);

  if (targetGhost) {
    return {
      afterDays: placement.afterDays,
      beforeDays: placement.beforeDays,
      startDate: placement.startDate,
      targetGhost,
      type: placement.type,
    };
  }

  return {
    afterDays: placement.afterDays,
    beforeDays: placement.beforeDays,
    startDate: placement.startDate,
    targetSlot: toSchedulePreviewSlot(placement.targetSlot as PreviewBaySlot),
    type: placement.type,
  };
}

function toSchedulePreviewGhostTarget(
  slot: unknown,
  options: { bayId: UUID; toPublicSeedIndex: (localSeedIndex: number) => number },
) {
  const localSeedIndex = getPreviewGhostLocalSeedIndex(slot);

  if (localSeedIndex === null) {
    return null;
  }

  const seedIndex = options.toPublicSeedIndex(localSeedIndex);

  return {
    id: `ghost:${options.bayId}:${seedIndex}`,
    seedIndex,
  };
}

function getPreviewGhostLocalSeedIndex(slot: unknown): number | null {
  const ghostMeta = (slot as { ghostMeta?: { seedIndex?: unknown } } | null)?.ghostMeta;

  if (typeof ghostMeta?.seedIndex === 'number') {
    return ghostMeta.seedIndex;
  }

  // Multi-seed preview targets can surface as projected ghost entries where only the synthetic id remains.
  const id = (slot as { id?: unknown } | null)?.id;

  if (typeof id !== 'string' || !id.startsWith('seed:')) {
    return null;
  }

  const seedIndex = Number.parseInt(id.slice('seed:'.length), 10);

  return Number.isSafeInteger(seedIndex) && seedIndex >= 0 ? seedIndex : null;
}

function toSchedulePreviewSlot(slot: PreviewBaySlot): JobSchedulePreviewSlot {
  const { splitOf, ...rest } = slot;

  return JobSchedulePreviewSlot.parse({
    ...rest,
    id: splitOf ? `${splitOf.sourceSlotId}:${splitOf.half}` : rest.id,
    ...(splitOf ? { previewSplit: { half: splitOf.half, sourceSlotId: splitOf.sourceSlotId } } : {}),
  });
}

/**
 * Body of a correlated subquery over a Job's Work Slots, for use inside a `db.query.jobs` (RQB) read.
 * The inner table gets a caller-supplied raw alias because the RQB rewrites drizzle column refs inside
 * a raw `sql` fragment to the outer Job alias — only `${jobs.id}` should correlate outward. Idle Slots
 * carry a null jobId, so `kind = 'work'` is the Work-Slot filter. `projection` is the inner select list
 * (`count(*)` for sorting, `1` for an existence check). This is the single definition of "a Job's
 * Work Slots" shared by the `scheduledSlots` sort and the `unscheduledOnly` filter.
 */
function jobWorkSlotsSubquery(alias: 'sort_slot' | 'filter_slot', projection: SQL): SQL {
  const slot = sql.raw(`"${alias}"`);
  return sql`select ${projection} from ${jobSlots} ${slot} where ${slot}."job_id" = ${jobs.id} and ${slot}."kind" = 'work'`;
}

function buildJobListWhere(input: JobListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.filters.jobId) {
    conditions.push(eq(jobs.id, input.filters.jobId));
  }

  if (input.filters.createdAtStart) {
    conditions.push(gte(jobs.createdAt, new Date(input.filters.createdAtStart)));
  }

  if (input.filters.unscheduledOnly) {
    // Existence check, not `count(*) = 0`: `not exists` stops at the first Work Slot instead of
    // scanning them all — cheaper on the unindexed `job_slot.job_id` as Jobs accumulate bay slots.
    conditions.push(sql`not exists (${jobWorkSlotsSubquery('filter_slot', sql`1`)})`);
  }

  if (input.search) {
    const codeSearch = parseJobCodeSearch(input.search);
    const searchWhere = or(
      createEscapedContainsSearchCondition(sql`${jobs.id}::text`, input.search),
      createEscapedContainsSearchCondition(sql`${jobs.code}::text`, input.search),
      createEscapedContainsSearchCondition(sql`${jobs.productSerialNumber}`, input.search),
      codeSearch === undefined ? undefined : eq(jobs.code, codeSearch),
    );

    if (searchWhere) {
      conditions.push(searchWhere);
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getJob({ db, id }: { db: Db | DatabaseTransaction; id: UUID }): Promise<JobDetail> {
  const row = await db.query.jobs.findFirst({
    columns: {
      createdAt: true,
      code: true,
      id: true,
      productId: true,
      productSerialNumber: true,
      productSerialPrefix: true,
      productSerialSequence: true,
      productSerialYear: true,
      quoteId: true,
      updatedAt: true,
      vinNumber: true,
    },
    where: eq(jobs.id, id),
    with: {
      product: {
        columns: {
          modelCode: true,
          name: true,
          thumbnailDataUrl: true,
        },
      },
      quote: {
        columns: {
          code: true,
        },
        with: {
          customer: {
            columns: {
              companyName: true,
              id: true,
              thumbnailDataUrl: true,
            },
          },
        },
      },
    },
  });

  if (!row) {
    throw new JobNotFoundError(id);
  }

  const [cfo, documents, schedule] = await Promise.all([
    listJobCfo({ db, jobId: row.id }),
    listJobDocumentRows({ db, jobId: row.id }),
    getJobSchedule({ db, jobId: row.id }),
  ]);

  return {
    ...mapJobSummary(row),
    cfo,
    documents,
    schedule,
  };
}

export async function getJobDocuments({
  db,
  jobId,
}: {
  db: Db | DatabaseTransaction;
  jobId: UUID;
}): Promise<JobDetail['documents']> {
  await assertJobExists({ db, jobId });

  return listJobDocumentRows({ db, jobId });
}

async function listJobDocumentRows({
  db,
  jobId,
}: {
  db: Db | DatabaseTransaction;
  jobId: UUID;
}): Promise<JobDetail['documents']> {
  const rows = await selectJobDocuments(db).where(eq(documents.jobId, jobId)).orderBy(asc(documents.filename));

  return rows.map(mapJobDocument);
}

export async function readJobDocument({
  db,
  documentId,
  jobId,
  storage,
}: {
  db: Db;
  documentId: UUID;
  jobId: UUID;
  storage: StorageAdapter;
}): Promise<ReadDocumentResult> {
  // Finding the document proves the Job exists (the document is scoped to its jobId), so only fall
  // back to the existence check on a miss to distinguish a missing Job from a missing document.
  const document = await findJobDocumentSummaryRow({ db, documentId, jobId });

  if (!document) {
    await assertJobExists({ db, jobId });
    throw new DocumentNotFoundError(documentId);
  }

  return {
    document: mapDocumentSummary(document),
    object: await storage.get(document.storageKey),
  };
}

function selectJobDocuments(db: Db | DatabaseTransaction) {
  return db
    .select({
      ...documentBaseSelect,
      sourceProductName: products.name,
      uploaderEmail: user.email,
      uploaderName: user.name,
    })
    .from(documents)
    .leftJoin(products, eq(documents.sourceProductId, products.id))
    .leftJoin(user, eq(documents.uploaderUserId, user.id))
    .$dynamic();
}

async function findJobDocumentSummaryRow({
  db,
  documentId,
  jobId,
}: {
  db: Db;
  documentId: UUID;
  jobId: UUID;
}): Promise<DocumentSummaryRow | null> {
  const [row] = await selectJobDocuments(db)
    .where(and(eq(documents.jobId, jobId), eq(documents.id, documentId)))
    .limit(1);

  return row ?? null;
}

function mapJobDocument(row: JobDocumentRow): JobDetail['documents'][number] {
  return JobDocument.parse({
    byteSize: row.byteSize,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
    filename: row.filename,
    id: row.id,
    jobId: row.jobId,
    metadata: row.metadata,
    ownerType: row.ownerType,
    productId: row.productId,
    quoteId: row.quoteId,
    sourceProductId: row.sourceProductId,
    sourceProductName: row.sourceProductName,
    uploaderEmail: row.uploaderEmail,
    uploaderName: row.uploaderName,
    uploaderUserId: row.uploaderUserId,
  });
}

async function assertJobExists({ db, jobId }: { db: Db | DatabaseTransaction; jobId: UUID }): Promise<void> {
  const row = await db.query.jobs.findFirst({
    columns: {
      id: true,
    },
    where: eq(jobs.id, jobId),
  });

  if (!row) {
    throw new JobNotFoundError(jobId);
  }
}

async function listJobCfo({ db, jobId }: { db: Db | DatabaseTransaction; jobId: UUID }): Promise<JobDetail['cfo']> {
  const rows = await db
    .select({
      assemblyId: jobCfoAssemblies.id,
      assemblyName: jobCfoAssemblies.assemblyName,
      kind: jobCfoAssemblies.kind,
      partCode: parts.code,
      partId: jobCfoParts.partId,
      partName: parts.name,
      quantity: jobCfoParts.quantity,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(jobCfoAssemblies)
    .leftJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
    .leftJoin(parts, eq(parts.id, jobCfoParts.partId))
    .where(eq(jobCfoAssemblies.jobId, jobId))
    .orderBy(
      sql`case ${jobCfoAssemblies.kind} when 'standard' then 0 else 1 end`,
      asc(jobCfoAssemblies.sequence),
      asc(parts.code),
      asc(jobCfoParts.partId),
    );

  const assemblies: JobDetail['cfo'] = [];
  const assemblyIndexesById = new Map<UUID, number>();

  for (const row of rows) {
    let assemblyIndex = assemblyIndexesById.get(row.assemblyId);

    if (assemblyIndex === undefined) {
      assemblyIndex = assemblies.length;
      assemblyIndexesById.set(row.assemblyId, assemblyIndex);
      assemblies.push({
        assemblyName: row.assemblyName,
        kind: row.kind,
        parts: [],
      });
    }

    if (row.partId && row.partCode && row.partName && row.quantity !== null && row.unitOfMeasure) {
      assemblies[assemblyIndex]?.parts.push({
        partCode: row.partCode,
        partId: row.partId,
        partName: row.partName,
        quantity: row.quantity,
        unitOfMeasure: row.unitOfMeasure,
      });
    }
  }

  return assemblies;
}

export function getJobSortColumn(sortBy: JobSortBy): SQL {
  const columns = {
    code: sql`${jobs.code}`,
    createdAt: sql`${jobs.createdAt}`,
    id: sql`${jobs.id}`,
    // Total Work Slots per Job; ascending puts the unscheduled (count 0) Jobs first.
    scheduledSlots: sql`(${jobWorkSlotsSubquery('sort_slot', sql`count(*)`)})`,
  } as const satisfies Record<JobSortBy, SQL>;

  return columns[sortBy];
}

export function getJobSortOrder(sortBy: JobSortBy, sortDirection: SortDirection): SQL {
  return sortDirection === 'desc' ? desc(getJobSortColumn(sortBy)) : asc(getJobSortColumn(sortBy));
}

export function mapJobSummary(row: JobWithProductRow, scheduleState: JobScheduleState | null = null): JobSummary {
  const mappedJob = mapJob(row);

  return {
    ...mappedJob,
    customerCompanyName: row.quote.customer.companyName,
    customerId: UUID.parse(row.quote.customer.id),
    customerThumbnailDataUrl: row.quote.customer.thumbnailDataUrl,
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    productThumbnailDataUrl: row.product.thumbnailDataUrl,
    quoteCode: QuoteCode.parse(row.quote.code),
    scheduleState,
  };
}

function mapJobSchedule({ bays, jobId }: { bays: BaySchedule[]; jobId: UUID }): JobDepartmentSchedule[] {
  return JOB_DEPARTMENT_PIPELINE.map(({ department }) => ({
    department,
    bays: bays
      .filter((bay) => bay.department === department)
      .map((bay) =>
        BaySchedule.parse({
          ...bay,
          slots: bay.slots.filter((slot) => slot.kind === 'work' && slot.jobId === jobId),
        }),
      )
      .filter((bay) => bay.slots.length > 0),
  }));
}

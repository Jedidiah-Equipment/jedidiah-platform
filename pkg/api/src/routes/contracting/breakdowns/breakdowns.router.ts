import {
  assignMechanic,
  getBreakdown,
  getBreakdownReportContext,
  listBreakdownFilterOptions,
  listBreakdownJobOptions,
  listBreakdowns,
  listMechanics,
  patchBreakdown,
  removeBreakdownPhoto,
  solveBreakdown,
  startBreakdown,
  summarizeBreakdownQueue,
} from '@pkg/core/contracting';
import {
  BreakdownAssignMechanicInput,
  BreakdownDetail,
  BreakdownFilterOptions,
  BreakdownIdInput,
  BreakdownJobOption,
  BreakdownListInput,
  BreakdownListResult,
  BreakdownNote,
  BreakdownNoteCreateInput,
  BreakdownPatchInput,
  BreakdownPhotoRemoveInput,
  BreakdownQueueSummary,
  BreakdownReportContext,
  BreakdownSolveInput,
  BreakdownStartInput,
  BreakdownSubjectRef,
  Mechanic,
} from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, businessProcedure, router } from '../../../trpc/init.js';
import { breakdownErrorFamily } from '../contracting-error-families.js';
import type { ContractingPushScheduler } from '../contracting-push-scheduler.js';
import { addThreadNote } from '../notes/notes.router.js';

const readers = ['contracting_breakdown:read', 'contracting_breakdown:report'] as const;
const writers = ['contracting_breakdown:update', 'contracting_breakdown:report'] as const;

// Reporting, with its photos, goes through the multipart upload route, the only transport that carries files.
export const createContractingBreakdownsRouter = (push: ContractingPushScheduler) =>
  router({
    list: authorizedProcedure(readers)
      .input(BreakdownListInput)
      .output(BreakdownListResult)
      .query(({ ctx, input }) =>
        mapCoreErrors(() => listBreakdowns({ db: ctx.db, actor: ctx.access, input }), breakdownErrorFamily),
      ),
    get: authorizedProcedure(readers)
      .input(BreakdownIdInput)
      .output(BreakdownDetail)
      .query(({ ctx, input }) =>
        mapCoreErrors(() => getBreakdown({ db: ctx.db, actor: ctx.access, id: input.id }), breakdownErrorFamily),
      ),
    queueSummary: authorizedProcedure('contracting_breakdown:read')
      .output(BreakdownQueueSummary)
      .query(({ ctx }) =>
        mapCoreErrors(() => summarizeBreakdownQueue({ db: ctx.db, actor: ctx.access }), breakdownErrorFamily),
      ),
    patch: authorizedProcedure(writers)
      .input(BreakdownPatchInput)
      .output(BreakdownDetail)
      .mutation(async ({ ctx, input }) => {
        const { breakdown, escalated } = await mapCoreErrors(
          () => patchBreakdown({ db: ctx.db, actor: ctx.access, input }),
          breakdownErrorFamily,
        );
        if (escalated)
          push.schedule({ kind: 'breakdown.escalated', breakdownId: breakdown.id, byUserId: ctx.access.userId });
        return breakdown;
      }),
    assignMechanic: authorizedProcedure('contracting_breakdown:update')
      .input(BreakdownAssignMechanicInput)
      .output(BreakdownDetail)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => assignMechanic({ db: ctx.db, actor: ctx.access, input }), breakdownErrorFamily),
      ),
    start: authorizedProcedure('contracting_breakdown:update')
      .input(BreakdownStartInput)
      .output(BreakdownDetail)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => startBreakdown({ db: ctx.db, actor: ctx.access, id: input.id }), breakdownErrorFamily),
      ),
    solve: authorizedProcedure('contracting_breakdown:update')
      .input(BreakdownSolveInput)
      .output(BreakdownDetail)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => solveBreakdown({ db: ctx.db, actor: ctx.access, input }), breakdownErrorFamily),
      ),
    removePhoto: authorizedProcedure(writers)
      .input(BreakdownPhotoRemoveInput)
      .output(BreakdownDetail)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => removeBreakdownPhoto({ db: ctx.db, actor: ctx.access, input, storage: ctx.storage }),
          breakdownErrorFamily,
        ),
      ),
    notes: router({
      // Delegates to contractingNotes.add; delete after the next mobile release.
      add: businessProcedure('contracting')
        .input(BreakdownNoteCreateInput)
        .output(BreakdownNote)
        .mutation(({ ctx, input }) =>
          addThreadNote(ctx, push, { thread: 'breakdown', id: input.breakdownId, text: input.text }),
        ),
    }),
    options: router({
      jobs: authorizedProcedure(writers)
        .input(BreakdownSubjectRef)
        .output(BreakdownJobOption.array())
        .query(({ ctx, input }) => listBreakdownJobOptions({ db: ctx.db, actor: ctx.access, subject: input })),
      filters: authorizedProcedure('contracting_breakdown:read')
        .output(BreakdownFilterOptions)
        .query(({ ctx }) =>
          mapCoreErrors(() => listBreakdownFilterOptions({ db: ctx.db, actor: ctx.access }), breakdownErrorFamily),
        ),
      mechanics: authorizedProcedure('contracting_breakdown:update')
        .output(Mechanic.array())
        .query(({ ctx }) => listMechanics({ db: ctx.db })),
    }),
    field: router({
      reportContext: authorizedProcedure('contracting_breakdown:report')
        .input(BreakdownSubjectRef)
        .output(BreakdownReportContext)
        .query(({ ctx, input }) => getBreakdownReportContext({ db: ctx.db, actor: ctx.access, subject: input })),
    }),
  });

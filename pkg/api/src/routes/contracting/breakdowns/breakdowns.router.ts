import {
  addBreakdownNote,
  assignMechanic,
  getBreakdown,
  listBreakdowns,
  listMechanics,
  listOpenBreakdownsOnSubject,
  patchBreakdown,
  removeBreakdownPhoto,
  solveBreakdown,
  startBreakdown,
  summarizeBreakdownQueue,
} from '@pkg/core/contracting';
import {
  BreakdownAssignMechanicInput,
  BreakdownDetail,
  BreakdownIdInput,
  BreakdownListInput,
  BreakdownListResult,
  BreakdownNote,
  BreakdownNoteCreateInput,
  BreakdownPatchInput,
  BreakdownPhotoRemoveInput,
  BreakdownQueueSummary,
  BreakdownSolveInput,
  BreakdownStartInput,
  BreakdownSubjectRef,
  BreakdownSummary,
  Mechanic,
} from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { breakdownErrorFamily } from '../contracting-error-families.js';

const readers = ['contracting_breakdown:read', 'contracting_breakdown:report'] as const;
const writers = ['contracting_breakdown:update', 'contracting_breakdown:report'] as const;

// Reporting, with its photos, goes through the multipart upload route, the only transport that carries files.
export const contractingBreakdownsRouter = router({
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
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => patchBreakdown({ db: ctx.db, actor: ctx.access, input }), breakdownErrorFamily),
    ),
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
    add: authorizedProcedure(writers)
      .input(BreakdownNoteCreateInput)
      .output(BreakdownNote)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => addBreakdownNote({ db: ctx.db, actor: ctx.access, input }), breakdownErrorFamily),
      ),
  }),
  options: router({
    mechanics: authorizedProcedure('contracting_breakdown:update')
      .output(Mechanic.array())
      .query(({ ctx }) => listMechanics({ db: ctx.db })),
  }),
  field: router({
    openOnSubject: authorizedProcedure('contracting_breakdown:report')
      .input(BreakdownSubjectRef)
      .output(BreakdownSummary.array())
      .query(({ ctx, input }) => listOpenBreakdownsOnSubject({ db: ctx.db, subject: input })),
  }),
});

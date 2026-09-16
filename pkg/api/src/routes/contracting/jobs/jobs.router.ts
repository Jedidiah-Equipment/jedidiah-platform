import {
  addAssignment,
  cancelJob,
  completeJob,
  createChargeLine,
  createJob,
  getJob,
  listForemen,
  listJobs,
  patchAssignment,
  patchChargeLine,
  patchJob,
  planAssignment,
  redactMoney,
  removeAssignment,
  removeChargeLine,
  removeMeasure,
  resolveGap,
  setMeasure,
} from '@pkg/core/contracting';
import { hasPermission } from '@pkg/domain';
import {
  AssignmentAddInput,
  AssignmentIdInput,
  AssignmentPatchInput,
  AssignmentPlanInput,
  ChargeLineCreateInput,
  ChargeLineIdInput,
  ChargeLinePatchInput,
  GapResolveInput,
  JobCancelInput,
  JobCompleteInput,
  JobCreateInput,
  JobListInput,
  JobLookupInput,
  JobPatchInput,
  MeasureRemoveInput,
  MeasureSetInput,
} from '@pkg/schema/contracting';
import { createAuthTRPCError, mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, requirePermission, router } from '../../../trpc/init.js';
import { jobErrorFamily } from '../contracting-error-families.js';

const readPermissions = ['contracting_job:read', 'contracting_job:read-own', 'contracting_job:read-priced'] as const;

function readMode(access: Parameters<typeof hasPermission>[0]) {
  if (hasPermission(access, 'contracting_job:read')) return 'all' as const;
  if (hasPermission(access, 'contracting_job:read-own')) return 'own' as const;
  return 'priced' as const;
}

function refuseRead() {
  throw createAuthTRPCError({
    appCode: 'auth.forbidden',
    code: 'FORBIDDEN',
    message: 'You do not have permission to view this Job.',
  });
}

export const contractingJobsRouter = router({
  jobs: router({
    list: authorizedProcedure(readPermissions)
      .input(JobListInput)
      .query(({ ctx, input }) =>
        mapCoreErrors(async () => {
          const mode = readMode(ctx.access);
          if (mode === 'priced' && !['awaiting-invoice', 'invoiced'].includes(input.queue)) refuseRead();
          return listJobs({
            db: ctx.db,
            queue: input.queue,
            ...(mode === 'own' ? { foremanUserId: ctx.session.user.id } : {}),
          });
        }, jobErrorFamily),
      ),
    get: authorizedProcedure(readPermissions)
      .input(JobLookupInput)
      .query(({ ctx, input }) =>
        mapCoreErrors(async () => {
          const job = await getJob({ db: ctx.db, ...input });
          const mode = readMode(ctx.access);
          if (mode === 'own') {
            if (job.foremanUserId !== ctx.session.user.id || !['upcoming', 'active', 'completed'].includes(job.status))
              refuseRead();
            return redactMoney(job);
          }
          if (mode === 'priced' && !['priced', 'invoiced'].includes(job.status)) refuseRead();
          return job;
        }, jobErrorFamily),
      ),
    create: authorizedProcedure('contracting_job:create')
      .input(JobCreateInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => createJob({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    patch: authorizedProcedure('contracting_job:update')
      .input(JobPatchInput)
      .mutation(({ ctx, input }) => {
        if (input.foremanUserId !== undefined) requirePermission(ctx.access, 'contracting_job:assign');
        return mapCoreErrors(() => patchJob({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily);
      }),
    complete: authorizedProcedure('contracting_job:complete')
      .input(JobCompleteInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => completeJob({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    cancel: authorizedProcedure('contracting_job:cancel')
      .input(JobCancelInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => cancelJob({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
  }),
  stints: router({
    plan: authorizedProcedure('contracting_job:assign')
      .input(AssignmentPlanInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => planAssignment({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    add: authorizedProcedure(['contracting_job:assign', 'contracting_assignment:update-own'])
      .input(AssignmentAddInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () =>
            hasPermission(ctx.access, 'contracting_job:assign')
              ? planAssignment({ db: ctx.db, actorUserId: ctx.session.user.id, input })
              : addAssignment({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
          jobErrorFamily,
        ),
      ),
    patch: authorizedProcedure(['contracting_job:assign', 'contracting_assignment:update-own'])
      .input(AssignmentPatchInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () =>
            patchAssignment({
              db: ctx.db,
              actorUserId: ctx.session.user.id,
              input,
              ownerOnly: !hasPermission(ctx.access, 'contracting_job:assign'),
            }),
          jobErrorFamily,
        ),
      ),
    remove: authorizedProcedure('contracting_job:assign')
      .input(AssignmentIdInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => removeAssignment({ db: ctx.db, actorUserId: ctx.session.user.id, id: input.id }),
          jobErrorFamily,
        ),
      ),
    resolveGap: authorizedProcedure('contracting_gap:resolve')
      .input(GapResolveInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => resolveGap({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
  }),
  measures: router({
    set: authorizedProcedure('contracting_job:update')
      .input(MeasureSetInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => setMeasure({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    remove: authorizedProcedure('contracting_job:update')
      .input(MeasureRemoveInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => removeMeasure({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
  }),
  chargeLines: router({
    create: authorizedProcedure('contracting_job:update')
      .input(ChargeLineCreateInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => createChargeLine({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    patch: authorizedProcedure('contracting_job:update')
      .input(ChargeLinePatchInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () =>
            patchChargeLine({
              db: ctx.db,
              actorUserId: ctx.session.user.id,
              input,
              canPrice: hasPermission(ctx.access, 'contracting_job:price'),
            }),
          jobErrorFamily,
        ),
      ),
    remove: authorizedProcedure('contracting_job:update')
      .input(ChargeLineIdInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => removeChargeLine({ db: ctx.db, actorUserId: ctx.session.user.id, id: input.id }),
          jobErrorFamily,
        ),
      ),
  }),
  options: router({
    foremen: authorizedProcedure('contracting_job:assign').query(({ ctx }) => listForemen({ db: ctx.db })),
  }),
});

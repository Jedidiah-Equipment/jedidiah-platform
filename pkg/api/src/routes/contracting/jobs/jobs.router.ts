import {
  addAssignment,
  cancelJob,
  clearStintRate,
  completeJob,
  countJobQueues,
  createChargeLine,
  createJob,
  findJobsByInvoiceNumber,
  getFieldJob,
  getReadableJob,
  hasActiveJobAttention,
  listFieldDrivers,
  listFieldImplements,
  listFieldJobs,
  listForemen,
  listJobs,
  listMeasureTypes,
  markPriced,
  patchAssignment,
  patchChargeLine,
  patchJob,
  planAssignment,
  removeAssignment,
  removeChargeLine,
  removeMeasure,
  resolveGap,
  setDieselPrice,
  setDiscount,
  setMeasure,
  setStintAmount,
  setStintRate,
  stampInvoice,
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
  DieselPriceInput,
  DiscountSetInput,
  FieldDriver,
  FieldImplement,
  FieldJob,
  GapResolveInput,
  InvoiceNumberLookupInput,
  JobCancelInput,
  JobCompleteInput,
  JobCreateInput,
  JobIdInput,
  JobListInput,
  JobLookupInput,
  JobMarkPricedInput,
  JobPatchInput,
  JobQueueCounts,
  JobStampInvoiceInput,
  MeasureRemoveInput,
  MeasureSetInput,
  MeasureType,
  StintAmountSetInput,
  StintRateClearInput,
  StintRateSetInput,
} from '@pkg/schema/contracting';
import { z } from 'zod';
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
  field: router({
    jobs: authorizedProcedure(['contracting_job:read', 'contracting_job:read-own'])
      .output(FieldJob.array())
      .query(({ ctx }) => mapCoreErrors(() => listFieldJobs({ db: ctx.db, actor: ctx.access }), jobErrorFamily)),
    job: authorizedProcedure(['contracting_job:read', 'contracting_job:read-own'])
      .input(JobIdInput)
      .output(FieldJob)
      .query(({ ctx, input }) =>
        mapCoreErrors(() => getFieldJob({ db: ctx.db, actor: ctx.access, id: input.id }), jobErrorFamily),
      ),
    implements: authorizedProcedure(['contracting_machine:read', 'contracting_assignment:update-own'])
      .output(FieldImplement.array())
      .query(({ ctx }) => listFieldImplements({ db: ctx.db })),
    drivers: authorizedProcedure(['contracting_job:assign', 'contracting_assignment:update-own'])
      .output(FieldDriver.array())
      .query(({ ctx }) => listFieldDrivers({ db: ctx.db })),
  }),
  jobs: router({
    activeAttention: authorizedProcedure(readPermissions)
      .output(z.boolean())
      .query(({ ctx }) => {
        const mode = readMode(ctx.access);
        if (mode === 'priced') return false;
        return mapCoreErrors(
          () =>
            hasActiveJobAttention({
              db: ctx.db,
              ...(mode === 'own' ? { foremanUserId: ctx.session.user.id } : {}),
            }),
          jobErrorFamily,
        );
      }),
    queueCounts: authorizedProcedure(readPermissions)
      .output(JobQueueCounts)
      .query(async ({ ctx }) => {
        const mode = readMode(ctx.access);
        const counts = await countJobQueues({
          db: ctx.db,
          ...(mode === 'own' ? { foremanUserId: ctx.session.user.id } : {}),
        });
        if (mode !== 'priced') return counts;
        return JobQueueCounts.parse({
          upcoming: 0,
          active: 0,
          'looks-finished': 0,
          'awaiting-pricing': counts['awaiting-pricing'],
          'awaiting-invoice': counts['awaiting-invoice'],
          invoiced: counts.invoiced,
          cancelled: 0,
        });
      }),
    list: authorizedProcedure(readPermissions)
      .input(JobListInput)
      .query(({ ctx, input }) =>
        mapCoreErrors(async () => {
          const mode = readMode(ctx.access);
          if (mode === 'priced' && !['awaiting-pricing', 'awaiting-invoice', 'invoiced'].includes(input.queue))
            refuseRead();
          return listJobs({
            db: ctx.db,
            ...input,
            ...(mode === 'own' ? { foremanUserId: ctx.session.user.id } : {}),
          });
        }, jobErrorFamily),
      ),
    get: authorizedProcedure(readPermissions)
      .input(JobLookupInput)
      .query(({ ctx, input }) =>
        mapCoreErrors(async () => {
          const mode = readMode(ctx.access);
          return getReadableJob({ db: ctx.db, actorUserId: ctx.session.user.id, mode, ...input });
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
  pricing: router({
    setStintRate: authorizedProcedure('contracting_job:price')
      .input(StintRateSetInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => setStintRate({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    clearStintRate: authorizedProcedure('contracting_job:price')
      .input(StintRateClearInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => clearStintRate({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    setStintAmount: authorizedProcedure('contracting_job:price')
      .input(StintAmountSetInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => setStintAmount({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    setDiesel: authorizedProcedure('contracting_job:price')
      .input(DieselPriceInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => setDieselPrice({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    setDiscount: authorizedProcedure('contracting_job:price')
      .input(DiscountSetInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => setDiscount({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    markPriced: authorizedProcedure('contracting_job:price')
      .input(JobMarkPricedInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => markPriced({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
  }),
  invoicing: router({
    stamp: authorizedProcedure('contracting_invoice:update')
      .input(JobStampInvoiceInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => stampInvoice({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
      ),
    byNumber: authorizedProcedure(['contracting_invoice:update', 'contracting_job:read'])
      .input(InvoiceNumberLookupInput)
      .query(({ ctx, input }) => findJobsByInvoiceNumber({ db: ctx.db, ...input })),
  }),
  options: router({
    foremen: authorizedProcedure('contracting_job:assign').query(({ ctx }) => listForemen({ db: ctx.db })),
    measureTypes: authorizedProcedure('contracting_job:update')
      .output(MeasureType.pick({ id: true, name: true }).array())
      .query(async ({ ctx }) => (await listMeasureTypes({ db: ctx.db })).map(({ id, name }) => ({ id, name }))),
  }),
});

import {
  addBayCalendarException,
  addIdleJobSlot,
  assignJobBayOperator,
  bookJobSlot,
  cancelJob,
  completeDepartmentTiming,
  createJob,
  createJobBay,
  deleteJobBay,
  getJob,
  getJobCancellationPlan,
  isJobCoreError,
  isProductUnitCoreError,
  isQuoteCoreError,
  type JobCoreError,
  listBayOperatorAssignmentHistory,
  listBayOperators,
  listBays,
  listCompletedJobSales,
  listJobBays,
  listJobCustomerOptions,
  listJobs,
  moveJobSlot,
  type ProductUnitCoreError,
  previewBoard,
  type QuoteCoreError,
  removeBayCalendarException,
  removeJobSlot,
  renameJobBay,
  resizeJobSlot,
  setJobBayDisabled,
  startDepartmentTiming,
  toggleOffDay,
  unassignJobBayOperator,
  updateDepartmentTiming,
  updateJob,
} from '@pkg/core/equipment';
import { hasPermission } from '@pkg/domain';
import { renderBrochurePdf } from '@pkg/pdf/equipment';
import { UUID } from '@pkg/schema';
import {
  AddBayCalendarExceptionInput,
  AddIdleJobSlotInput,
  BoardListInput,
  BoardPreviewInput,
  BookJobSlotInput,
  JobBayAssignOperatorInput,
  JobBayCreateInput,
  JobBayDeleteInput,
  JobBayListInput,
  JobBayOperatorAssignmentHistoryInput,
  JobBayRenameInput,
  JobBaySetDisabledInput,
  JobBayUnassignOperatorInput,
  JobCancelInput,
  JobCreateInput,
  JobCustomerOptionListInput,
  JobDepartmentTimingCompleteInput,
  JobDepartmentTimingStartInput,
  JobDepartmentTimingUpdateInput,
  JobListInput,
  JobSalesExportInput,
  JobUpdateInput,
  MoveJobSlotInput,
  RemoveBayCalendarExceptionInput,
  RemoveJobSlotInput,
  ResizeJobSlotInput,
  ToggleOffDayInput,
} from '@pkg/schema/equipment';
import { z } from 'zod';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, fullyAuthorizedProcedure, router } from '../../../trpc/init.js';

export const jobsRouter = router({
  listBays: authorizedProcedure('equipment_job:read')
    .input(BoardListInput)
    .query(({ ctx, input }) => listBays({ db: ctx.db, input })),

  previewSchedule: authorizedProcedure('equipment_job:read')
    .input(BoardPreviewInput)
    .query(({ ctx, input }) => mapJobErrors(() => previewBoard({ db: ctx.db, input }))),

  listJobBays: authorizedProcedure(['equipment_job:read', 'equipment_job_bay:read'])
    .input(JobBayListInput)
    .query(({ ctx, input }) => listJobBays({ db: ctx.db, input })),

  createBay: authorizedProcedure('equipment_job_bay:update')
    .input(JobBayCreateInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => createJobBay({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  renameBay: authorizedProcedure('equipment_job_bay:update')
    .input(JobBayRenameInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => renameJobBay({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  deleteBay: authorizedProcedure('equipment_job_bay:update')
    .input(JobBayDeleteInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => deleteJobBay({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  setBayDisabled: authorizedProcedure('equipment_job_bay:update')
    .input(JobBaySetDisabledInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => setJobBayDisabled({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  /**
   * Any-of: Bay administration names operators against Bays, and Department Timing names them as a
   * Job's crew. Coupling the crew picker to `equipment_job_bay:update` would fail silently if the two roles ever
   * diverge — the query 403s and the picker just reads empty. Nothing new leaks: a caller holding
   * `equipment_job:update` already sees operator names on every Job sheet and Bay schedule.
   */
  listBayOperators: authorizedProcedure(['equipment_job_bay:update', 'equipment_job:update']).query(({ ctx }) =>
    listBayOperators({ db: ctx.db }),
  ),

  listBayOperatorAssignmentHistory: authorizedProcedure('equipment_job_bay:read')
    .input(JobBayOperatorAssignmentHistoryInput)
    .query(({ ctx, input }) => mapJobErrors(() => listBayOperatorAssignmentHistory({ db: ctx.db, input }))),

  assignBayOperator: authorizedProcedure('equipment_job_bay:update')
    .input(JobBayAssignOperatorInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => assignJobBayOperator({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  unassignBayOperator: authorizedProcedure('equipment_job_bay:update')
    .input(JobBayUnassignOperatorInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => unassignJobBayOperator({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  toggleOffDay: authorizedProcedure('equipment_job:update-calendar')
    .input(ToggleOffDayInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => toggleOffDay({ db: ctx.db, input }))),

  list: authorizedProcedure('equipment_job:read')
    .input(JobListInput)
    .query(({ ctx, input }) => listJobs({ db: ctx.db, input })),

  /**
   * One row of this report crosses three gates at once — the ledger's cost, the Job, and the Quote's
   * Customer, invoice number and price — so it demands all three rather than any of them. An any-of
   * gate would hand a caller holding just one of the three a spreadsheet of facts it can reach on no
   * other screen. Gated whole rather than field by field: a caller who cannot read cost would be
   * downloading the report with its point cut out of it.
   */
  salesExport: fullyAuthorizedProcedure(['equipment_inventory_cost:read', 'equipment_job:read', 'equipment_quote:read'])
    .input(JobSalesExportInput)
    .query(({ ctx, input }) => listCompletedJobSales({ db: ctx.db, input })),

  customerOptions: authorizedProcedure('equipment_job:read')
    .input(JobCustomerOptionListInput)
    .query(({ ctx, input }) => listJobCustomerOptions({ db: ctx.db, input })),

  get: authorizedProcedure('equipment_job:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) =>
      mapJobErrors(() => getJob({ db: ctx.db, id: input.id })).then((job) => ({
        ...job,
        documents: hasPermission(ctx.access, 'equipment_inventory_cost:read')
          ? job.documents
          : job.documents.filter((document) => document.ownerType !== 'purchase_order'),
      })),
    ),

  create: authorizedProcedure('equipment_job:create')
    .input(JobCreateInput)
    .mutation(({ ctx, input }) =>
      mapCreateJobErrors(() =>
        createJob({
          actorUserId: ctx.session.user.id,
          brochureRenderer: renderBrochurePdf,
          db: ctx.db,
          input,
          storage: ctx.storage,
        }),
      ),
    ),

  update: authorizedProcedure('equipment_job:update')
    .input(JobUpdateInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => updateJob({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  /**
   * Department Timing stamps ride `equipment_job:update` rather than a gate of their own: recording that
   * fabrication started is day-to-day Job upkeep, unlike the terminal `equipment_job:cancel`.
   */
  startDepartmentTiming: authorizedProcedure('equipment_job:update')
    .input(JobDepartmentTimingStartInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => startDepartmentTiming({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  completeDepartmentTiming: authorizedProcedure('equipment_job:update')
    .input(JobDepartmentTimingCompleteInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => completeDepartmentTiming({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  updateDepartmentTiming: authorizedProcedure('equipment_job:update')
    .input(JobDepartmentTimingUpdateInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => updateDepartmentTiming({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  /** What the cancel dialog is about to touch. A Job with a Quote is never offered its machine. */
  cancellationPlan: authorizedProcedure('equipment_job:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapJobErrors(() => getJobCancellationPlan({ db: ctx.db, id: input.id }))),

  /**
   * Its own gate rather than `equipment_job:update`: this is terminal and irreversible, so it sits with
   * `equipment_quote:cancel` and `equipment_product_unit:remove` rather than with day-to-day Job edits.
   */
  cancel: authorizedProcedure('equipment_job:cancel')
    .input(JobCancelInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => cancelJob({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  bookSlot: authorizedProcedure('equipment_job:schedule')
    .input(BookJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => bookJobSlot({ db: ctx.db, input }))),

  addIdleSlot: authorizedProcedure('equipment_job:schedule')
    .input(AddIdleJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => addIdleJobSlot({ db: ctx.db, input }))),

  addBayException: authorizedProcedure('equipment_job:schedule')
    .input(AddBayCalendarExceptionInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => addBayCalendarException({ db: ctx.db, input }))),

  removeBayException: authorizedProcedure('equipment_job:schedule')
    .input(RemoveBayCalendarExceptionInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => removeBayCalendarException({ db: ctx.db, input }))),

  resizeSlot: authorizedProcedure('equipment_job:schedule')
    .input(ResizeJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => resizeJobSlot({ db: ctx.db, input }))),

  moveSlot: authorizedProcedure('equipment_job:schedule')
    .input(MoveJobSlotInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => moveJobSlot({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  removeSlot: authorizedProcedure('equipment_job:schedule')
    .input(RemoveJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => removeJobSlot({ db: ctx.db, input }))),
});

async function mapJobErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isJobCoreError, mapJobCoreError);
}

// Job creation crosses Quote and Product Unit boundaries, so map both feature errors alongside Job errors.
async function mapCreateJobErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapJobErrors(() =>
    mapKnownCoreError(
      () => mapKnownCoreError(action, isProductUnitCoreError, mapProductUnitCoreError),
      isQuoteCoreError,
      mapJobQuoteCoreError,
    ),
  );
}

function mapProductUnitCoreError(error: ProductUnitCoreError): CoreErrorMapping<ProductUnitCoreError['code']> {
  if (error.code === 'product_unit.not_found') {
    return { appCode: error.code, code: 'NOT_FOUND', message: 'Product unit not found.' };
  }

  return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
}

function mapJobQuoteCoreError(error: QuoteCoreError): CoreErrorMapping<QuoteCoreError['code']> {
  if (error.code === 'quote.not_found') {
    return {
      appCode: error.code,
      code: 'NOT_FOUND',
      message: 'Quote not found.',
    };
  }

  return {
    appCode: error.code,
    code: 'BAD_REQUEST',
    message: error.message,
  };
}

function mapJobCoreError(error: JobCoreError): CoreErrorMapping<JobCoreError['code']> {
  switch (error.code) {
    case 'job.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Job not found.',
      };
    case 'job.create_from_quote_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.stock_build_denied':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    case 'job.cancelled':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    case 'job.already_completed':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    case 'job.completed_on_in_future':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    case 'job.department_timing_locked':
    case 'job.department_timing_already_completed':
    case 'job.department_timing_already_started':
    case 'job.department_timing_not_started':
    case 'job.department_timing_invalid':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    case 'job.bay_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Job bay not found.',
      };
    case 'job.bay_in_use':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: error.message,
      };
    case 'job.bay_operator_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Bay operator not found.',
      };
    case 'job.bay_operator_role_denied':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    case 'job.bay_operator_assignment_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.bay_already_assigned':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: error.message,
      };
    case 'job.bay_operator_assignment_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Bay has no current operator assignment.',
      };
    case 'job.slot_booking_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.slot_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Job slot not found.',
      };
    // A request the product never offers: only a Stock Build shows the remove-the-unit option.
    case 'job.unit_removal_denied':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    default:
      return assertNever(error);
  }
}

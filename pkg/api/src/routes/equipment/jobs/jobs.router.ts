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
  listBayOperatorAssignmentHistory,
  listBayOperators,
  listBays,
  listCompletedJobSales,
  listJobBays,
  listJobCustomerOptions,
  listJobs,
  moveJobSlot,
  previewBoard,
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

import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, fullyAuthorizedProcedure, router } from '../../../trpc/init.js';
import { jobErrorFamily, productUnitErrorFamily, quoteErrorFamily } from '../equipment-error-families.js';

export const jobsRouter = router({
  listBays: authorizedProcedure('equipment_job:read')
    .input(BoardListInput)
    .query(({ ctx, input }) => listBays({ db: ctx.db, input })),

  previewSchedule: authorizedProcedure('equipment_job:read')
    .input(BoardPreviewInput)
    .query(({ ctx, input }) => mapCoreErrors(() => previewBoard({ db: ctx.db, input }), jobErrorFamily)),

  listJobBays: authorizedProcedure(['equipment_job:read', 'equipment_job_bay:read'])
    .input(JobBayListInput)
    .query(({ ctx, input }) => listJobBays({ db: ctx.db, input })),

  createBay: authorizedProcedure('equipment_job_bay:update')
    .input(JobBayCreateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => createJobBay({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
    ),

  renameBay: authorizedProcedure('equipment_job_bay:update')
    .input(JobBayRenameInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => renameJobBay({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
    ),

  deleteBay: authorizedProcedure('equipment_job_bay:update')
    .input(JobBayDeleteInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => deleteJobBay({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
    ),

  setBayDisabled: authorizedProcedure('equipment_job_bay:update')
    .input(JobBaySetDisabledInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => setJobBayDisabled({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
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
    .query(({ ctx, input }) =>
      mapCoreErrors(() => listBayOperatorAssignmentHistory({ db: ctx.db, input }), jobErrorFamily),
    ),

  assignBayOperator: authorizedProcedure('equipment_job_bay:update')
    .input(JobBayAssignOperatorInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => assignJobBayOperator({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
        jobErrorFamily,
      ),
    ),

  unassignBayOperator: authorizedProcedure('equipment_job_bay:update')
    .input(JobBayUnassignOperatorInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => unassignJobBayOperator({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
        jobErrorFamily,
      ),
    ),

  toggleOffDay: authorizedProcedure('equipment_job:update-calendar')
    .input(ToggleOffDayInput)
    .mutation(({ ctx, input }) => mapCoreErrors(() => toggleOffDay({ db: ctx.db, input }), jobErrorFamily)),

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
      mapCoreErrors(() => getJob({ db: ctx.db, id: input.id }), jobErrorFamily).then((job) => ({
        ...job,
        documents: hasPermission(ctx.access, 'equipment_inventory_cost:read')
          ? job.documents
          : job.documents.filter((document) => document.ownerType !== 'purchase_order'),
      })),
    ),

  create: authorizedProcedure('equipment_job:create')
    .input(JobCreateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () =>
          createJob({
            actorUserId: ctx.session.user.id,
            brochureRenderer: renderBrochurePdf,
            db: ctx.db,
            input,
            storage: ctx.storage,
          }),
        jobErrorFamily,
        quoteErrorFamily,
        productUnitErrorFamily,
      ),
    ),

  update: authorizedProcedure('equipment_job:update')
    .input(JobUpdateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => updateJob({ actorUserId: ctx.session.user.id, db: ctx.db, input }), jobErrorFamily),
    ),

  /**
   * Department Timing stamps ride `equipment_job:update` rather than a gate of their own: recording that
   * fabrication started is day-to-day Job upkeep, unlike the terminal `equipment_job:cancel`.
   */
  startDepartmentTiming: authorizedProcedure('equipment_job:update')
    .input(JobDepartmentTimingStartInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => startDepartmentTiming({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
        jobErrorFamily,
      ),
    ),

  completeDepartmentTiming: authorizedProcedure('equipment_job:update')
    .input(JobDepartmentTimingCompleteInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => completeDepartmentTiming({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
        jobErrorFamily,
      ),
    ),

  updateDepartmentTiming: authorizedProcedure('equipment_job:update')
    .input(JobDepartmentTimingUpdateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => updateDepartmentTiming({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
        jobErrorFamily,
      ),
    ),

  /** What the cancel dialog is about to touch. A Job with a Quote is never offered its machine. */
  cancellationPlan: authorizedProcedure('equipment_job:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) =>
      mapCoreErrors(() => getJobCancellationPlan({ db: ctx.db, id: input.id }), jobErrorFamily),
    ),

  /**
   * Its own gate rather than `equipment_job:update`: this is terminal and irreversible, so it sits with
   * `equipment_quote:cancel` and `equipment_product_unit:remove` rather than with day-to-day Job edits.
   */
  cancel: authorizedProcedure('equipment_job:cancel')
    .input(JobCancelInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => cancelJob({ actorUserId: ctx.session.user.id, db: ctx.db, input }), jobErrorFamily),
    ),

  bookSlot: authorizedProcedure('equipment_job:schedule')
    .input(BookJobSlotInput)
    .mutation(({ ctx, input }) => mapCoreErrors(() => bookJobSlot({ db: ctx.db, input }), jobErrorFamily)),

  addIdleSlot: authorizedProcedure('equipment_job:schedule')
    .input(AddIdleJobSlotInput)
    .mutation(({ ctx, input }) => mapCoreErrors(() => addIdleJobSlot({ db: ctx.db, input }), jobErrorFamily)),

  addBayException: authorizedProcedure('equipment_job:schedule')
    .input(AddBayCalendarExceptionInput)
    .mutation(({ ctx, input }) => mapCoreErrors(() => addBayCalendarException({ db: ctx.db, input }), jobErrorFamily)),

  removeBayException: authorizedProcedure('equipment_job:schedule')
    .input(RemoveBayCalendarExceptionInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => removeBayCalendarException({ db: ctx.db, input }), jobErrorFamily),
    ),

  resizeSlot: authorizedProcedure('equipment_job:schedule')
    .input(ResizeJobSlotInput)
    .mutation(({ ctx, input }) => mapCoreErrors(() => resizeJobSlot({ db: ctx.db, input }), jobErrorFamily)),

  moveSlot: authorizedProcedure('equipment_job:schedule')
    .input(MoveJobSlotInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => moveJobSlot({ db: ctx.db, actorUserId: ctx.session.user.id, input }), jobErrorFamily),
    ),

  removeSlot: authorizedProcedure('equipment_job:schedule')
    .input(RemoveJobSlotInput)
    .mutation(({ ctx, input }) => mapCoreErrors(() => removeJobSlot({ db: ctx.db, input }), jobErrorFamily)),
});

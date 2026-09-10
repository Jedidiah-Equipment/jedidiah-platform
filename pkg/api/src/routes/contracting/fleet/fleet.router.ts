import {
  createCategory,
  createImplement,
  createMachine,
  getCategory,
  getImplement,
  getMachine,
  isFleetError,
  listCategories,
  listImplements,
  listMachines,
  machineOptions,
  patchCategory,
  patchImplement,
  patchMachine,
  removeCategory,
  removeImplement,
  removeMachine,
  retireImplement,
  retireMachine,
  suggestImplementCode,
} from '@pkg/core/contracting';
import {
  CategoryCreateInput,
  CategoryListInput,
  CategoryPatchInput,
  FleetIdInput,
  FleetListInput,
  FleetRetireInput,
  ImplementCodeSuggestInput,
  ImplementCreateInput,
  ImplementPatchInput,
  MachineCreateInput,
  MachineListInput,
  MachinePatchInput,
} from '@pkg/schema/contracting';
import { mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';

function mapFleetErrors<T>(action: () => Promise<T>) {
  return mapKnownCoreError(action, isFleetError, (error) => ({
    appCode: error.code,
    message: error.message,
    code:
      error.code === 'fleet.not_found'
        ? 'NOT_FOUND'
        : error.code === 'fleet.invalid_driver' ||
            error.code === 'fleet.invalid_reference' ||
            error.code === 'fleet.invalid_category'
          ? 'BAD_REQUEST'
          : 'CONFLICT',
  }));
}
export const contractingFleetRouter = router({
  categories: router({
    list: authorizedProcedure('contracting_machine:read')
      .input(CategoryListInput.optional())
      .query(({ ctx, input }) => listCategories({ db: ctx.db, input: input ?? {} })),
    get: authorizedProcedure('contracting_machine:read')
      .input(FleetIdInput)
      .query(({ ctx, input }) => mapFleetErrors(() => getCategory({ db: ctx.db, id: input.id }))),
    create: authorizedProcedure('contracting_machine:update')
      .input(CategoryCreateInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => createCategory({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    patch: authorizedProcedure('contracting_machine:update')
      .input(CategoryPatchInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => patchCategory({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    remove: authorizedProcedure('contracting_machine:update')
      .input(FleetIdInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => removeCategory({ db: ctx.db, actorUserId: ctx.session.user.id, id: input.id })),
      ),
  }),
  machines: router({
    list: authorizedProcedure('contracting_machine:read')
      .input(MachineListInput)
      .query(({ ctx, input }) => listMachines({ db: ctx.db, input })),
    options: authorizedProcedure('contracting_machine:read').query(({ ctx }) => machineOptions({ db: ctx.db })),
    get: authorizedProcedure('contracting_machine:read')
      .input(FleetIdInput)
      .query(({ ctx, input }) => mapFleetErrors(() => getMachine({ db: ctx.db, id: input.id }))),
    create: authorizedProcedure('contracting_machine:update')
      .input(MachineCreateInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => createMachine({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    patch: authorizedProcedure('contracting_machine:update')
      .input(MachinePatchInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => patchMachine({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    retire: authorizedProcedure('contracting_machine:update')
      .input(FleetRetireInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => retireMachine({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    remove: authorizedProcedure('contracting_machine:update')
      .input(FleetIdInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => removeMachine({ db: ctx.db, actorUserId: ctx.session.user.id, id: input.id })),
      ),
  }),
  implements: router({
    list: authorizedProcedure('contracting_machine:read')
      .input(FleetListInput)
      .query(({ ctx, input }) => listImplements({ db: ctx.db, input })),
    suggestCode: authorizedProcedure('contracting_machine:update')
      .input(ImplementCodeSuggestInput)
      .query(({ ctx, input }) => mapFleetErrors(() => suggestImplementCode({ db: ctx.db, ...input }))),
    get: authorizedProcedure('contracting_machine:read')
      .input(FleetIdInput)
      .query(({ ctx, input }) => mapFleetErrors(() => getImplement({ db: ctx.db, id: input.id }))),
    create: authorizedProcedure('contracting_machine:update')
      .input(ImplementCreateInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => createImplement({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    patch: authorizedProcedure('contracting_machine:update')
      .input(ImplementPatchInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => patchImplement({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    retire: authorizedProcedure('contracting_machine:update')
      .input(FleetRetireInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => retireImplement({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    remove: authorizedProcedure('contracting_machine:update')
      .input(FleetIdInput)
      .mutation(({ ctx, input }) =>
        mapFleetErrors(() => removeImplement({ db: ctx.db, actorUserId: ctx.session.user.id, id: input.id })),
      ),
  }),
});

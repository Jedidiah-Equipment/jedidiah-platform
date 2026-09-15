import {
  createCategory,
  createImplement,
  createMachine,
  getCategory,
  getImplement,
  getMachine,
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
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { fleetErrorFamily } from '../contracting-error-families.js';

export const contractingFleetRouter = router({
  categories: router({
    list: authorizedProcedure('contracting_machine:read')
      .input(CategoryListInput.optional())
      .query(({ ctx, input }) => listCategories({ db: ctx.db, input: input ?? {} })),
    get: authorizedProcedure('contracting_machine:read')
      .input(FleetIdInput)
      .query(({ ctx, input }) => mapCoreErrors(() => getCategory({ db: ctx.db, id: input.id }), fleetErrorFamily)),
    create: authorizedProcedure('contracting_machine:update')
      .input(CategoryCreateInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => createCategory({ db: ctx.db, actorUserId: ctx.session.user.id, input }), fleetErrorFamily),
      ),
    patch: authorizedProcedure('contracting_machine:update')
      .input(CategoryPatchInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => patchCategory({ db: ctx.db, actorUserId: ctx.session.user.id, input }), fleetErrorFamily),
      ),
    remove: authorizedProcedure('contracting_machine:update')
      .input(FleetIdInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => removeCategory({ db: ctx.db, actorUserId: ctx.session.user.id, id: input.id }),
          fleetErrorFamily,
        ),
      ),
  }),
  machines: router({
    list: authorizedProcedure('contracting_machine:read')
      .input(MachineListInput)
      .query(({ ctx, input }) => listMachines({ db: ctx.db, input })),
    options: authorizedProcedure('contracting_machine:read').query(({ ctx }) => machineOptions({ db: ctx.db })),
    get: authorizedProcedure('contracting_machine:read')
      .input(FleetIdInput)
      .query(({ ctx, input }) => mapCoreErrors(() => getMachine({ db: ctx.db, id: input.id }), fleetErrorFamily)),
    create: authorizedProcedure('contracting_machine:update')
      .input(MachineCreateInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => createMachine({ db: ctx.db, actorUserId: ctx.session.user.id, input }), fleetErrorFamily),
      ),
    patch: authorizedProcedure('contracting_machine:update')
      .input(MachinePatchInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => patchMachine({ db: ctx.db, actorUserId: ctx.session.user.id, input }), fleetErrorFamily),
      ),
    retire: authorizedProcedure('contracting_machine:update')
      .input(FleetRetireInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => retireMachine({ db: ctx.db, actorUserId: ctx.session.user.id, input }), fleetErrorFamily),
      ),
    remove: authorizedProcedure('contracting_machine:update')
      .input(FleetIdInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => removeMachine({ db: ctx.db, actorUserId: ctx.session.user.id, id: input.id }),
          fleetErrorFamily,
        ),
      ),
  }),
  implements: router({
    list: authorizedProcedure('contracting_machine:read')
      .input(FleetListInput)
      .query(({ ctx, input }) => listImplements({ db: ctx.db, input })),
    suggestCode: authorizedProcedure('contracting_machine:update')
      .input(ImplementCodeSuggestInput)
      .query(({ ctx, input }) => mapCoreErrors(() => suggestImplementCode({ db: ctx.db, ...input }), fleetErrorFamily)),
    get: authorizedProcedure('contracting_machine:read')
      .input(FleetIdInput)
      .query(({ ctx, input }) => mapCoreErrors(() => getImplement({ db: ctx.db, id: input.id }), fleetErrorFamily)),
    create: authorizedProcedure('contracting_machine:update')
      .input(ImplementCreateInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => createImplement({ db: ctx.db, actorUserId: ctx.session.user.id, input }), fleetErrorFamily),
      ),
    patch: authorizedProcedure('contracting_machine:update')
      .input(ImplementPatchInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => patchImplement({ db: ctx.db, actorUserId: ctx.session.user.id, input }), fleetErrorFamily),
      ),
    retire: authorizedProcedure('contracting_machine:update')
      .input(FleetRetireInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => retireImplement({ db: ctx.db, actorUserId: ctx.session.user.id, input }), fleetErrorFamily),
      ),
    remove: authorizedProcedure('contracting_machine:update')
      .input(FleetIdInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => removeImplement({ db: ctx.db, actorUserId: ctx.session.user.id, id: input.id }),
          fleetErrorFamily,
        ),
      ),
  }),
});

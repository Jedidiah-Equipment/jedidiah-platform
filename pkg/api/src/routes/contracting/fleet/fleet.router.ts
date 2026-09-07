import {
  createCategory,
  createImplement,
  createMachine,
  getCategory,
  getImplement,
  getMachine,
  implementTypes,
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
} from '@pkg/core/contracting';
import { hasPermission } from '@pkg/domain';
import {
  type Category,
  CategoryCreateInput,
  CategoryPatchInput,
  FleetIdInput,
  FleetListInput,
  FleetRetireInput,
  ImplementCreateInput,
  ImplementPatchInput,
  MachineCreateInput,
  MachineListInput,
  MachinePatchInput,
} from '@pkg/schema/contracting';
import { TRPCError } from '@trpc/server';
import { mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';

function mapFleetErrors<T>(action: () => Promise<T>) {
  return mapKnownCoreError(action, isFleetError, (error) => ({
    appCode: error.code,
    message: error.message,
    code:
      error.code === 'fleet.not_found'
        ? 'NOT_FOUND'
        : error.code === 'fleet.invalid_driver' || error.code === 'fleet.invalid_reference'
          ? 'BAD_REQUEST'
          : 'CONFLICT',
  }));
}
function visibleCategory(category: Category, access: Parameters<typeof hasPermission>[0]): Category {
  if (hasPermission(access, 'contracting_rate:read')) return category;
  const { presetRate: _rate, ...visible } = category;
  return visible;
}
function assertRateUpdate(input: { presetRate?: number | undefined }, access: Parameters<typeof hasPermission>[0]) {
  if (input.presetRate !== undefined && !hasPermission(access, 'contracting_rate:update')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to edit preset rates.' });
  }
}
export const contractingFleetRouter = router({
  categories: router({
    list: authorizedProcedure('contracting_machine:read').query(async ({ ctx }) =>
      (await listCategories({ db: ctx.db })).map((category) => visibleCategory(category, ctx.access)),
    ),
    get: authorizedProcedure('contracting_machine:read')
      .input(FleetIdInput)
      .query(({ ctx, input }) =>
        mapFleetErrors(async () => visibleCategory(await getCategory({ db: ctx.db, id: input.id }), ctx.access)),
      ),
    create: authorizedProcedure('contracting_machine:update')
      .input(CategoryCreateInput)
      .mutation(({ ctx, input }) => {
        assertRateUpdate(input, ctx.access);
        return mapFleetErrors(async () =>
          visibleCategory(await createCategory({ db: ctx.db, actorUserId: ctx.session.user.id, input }), ctx.access),
        );
      }),
    patch: authorizedProcedure('contracting_machine:update')
      .input(CategoryPatchInput)
      .mutation(({ ctx, input }) => {
        assertRateUpdate(input, ctx.access);
        return mapFleetErrors(async () =>
          visibleCategory(await patchCategory({ db: ctx.db, actorUserId: ctx.session.user.id, input }), ctx.access),
        );
      }),
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
    options: authorizedProcedure('contracting_machine:read').query(({ ctx }) => implementTypes({ db: ctx.db })),
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

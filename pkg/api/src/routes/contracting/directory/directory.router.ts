import {
  createCustomer,
  createFarm,
  createWorkType,
  getCustomer,
  getWorkType,
  listCustomers,
  listFarms,
  listWorkTypes,
  patchCustomer,
  patchFarm,
  patchWorkType,
  removeFarm,
  workTypeOptions,
} from '@pkg/core/contracting';
import { UUID } from '@pkg/schema';
import {
  CustomerCreateInput,
  CustomerPatchInput,
  FarmCreateInput,
  FarmIdInput,
  FarmListInput,
  FarmPatchInput,
  WorkTypeCreateInput,
  WorkTypePatchInput,
} from '@pkg/schema/contracting';
import { z } from 'zod';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { directoryErrorFamily } from '../contracting-error-families.js';

const idInput = z.object({ id: UUID });
export const contractingDirectoryRouter = router({
  customers: router({
    list: authorizedProcedure('contracting_directory:read').query(({ ctx }) =>
      mapCoreErrors(() => listCustomers({ db: ctx.db }), directoryErrorFamily),
    ),
    get: authorizedProcedure('contracting_directory:read')
      .input(idInput)
      .query(({ ctx, input }) => mapCoreErrors(() => getCustomer({ db: ctx.db, id: input.id }), directoryErrorFamily)),
    create: authorizedProcedure('contracting_directory:update')
      .input(CustomerCreateInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => createCustomer({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
          directoryErrorFamily,
        ),
      ),
    patch: authorizedProcedure('contracting_directory:update')
      .input(CustomerPatchInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => patchCustomer({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
          directoryErrorFamily,
        ),
      ),
  }),
  farms: router({
    list: authorizedProcedure('contracting_directory:read')
      .input(FarmListInput)
      .query(({ ctx, input }) =>
        mapCoreErrors(() => listFarms({ db: ctx.db, customerId: input.customerId }), directoryErrorFamily),
      ),
    create: authorizedProcedure('contracting_directory:update')
      .input(FarmCreateInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => createFarm({ db: ctx.db, actorUserId: ctx.session.user.id, input }), directoryErrorFamily),
      ),
    patch: authorizedProcedure('contracting_directory:update')
      .input(FarmPatchInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => patchFarm({ db: ctx.db, actorUserId: ctx.session.user.id, input }), directoryErrorFamily),
      ),
    remove: authorizedProcedure('contracting_directory:update')
      .input(FarmIdInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => removeFarm({ db: ctx.db, actorUserId: ctx.session.user.id, input }), directoryErrorFamily),
      ),
  }),
  workTypes: router({
    list: authorizedProcedure('contracting_directory:read').query(({ ctx }) =>
      mapCoreErrors(() => listWorkTypes({ db: ctx.db }), directoryErrorFamily),
    ),
    options: authorizedProcedure('contracting_directory:read').query(({ ctx }) =>
      mapCoreErrors(() => workTypeOptions({ db: ctx.db }), directoryErrorFamily),
    ),
    get: authorizedProcedure('contracting_directory:read')
      .input(idInput)
      .query(({ ctx, input }) => mapCoreErrors(() => getWorkType({ db: ctx.db, id: input.id }), directoryErrorFamily)),
    create: authorizedProcedure('contracting_directory:update')
      .input(WorkTypeCreateInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => createWorkType({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
          directoryErrorFamily,
        ),
      ),
    patch: authorizedProcedure('contracting_directory:update')
      .input(WorkTypePatchInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => patchWorkType({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
          directoryErrorFamily,
        ),
      ),
  }),
});

import {
  createCustomer,
  createFarm,
  createWorkType,
  getCustomer,
  getWorkType,
  isDirectoryError,
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
import { mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';

const idInput = z.object({ id: UUID });
function mapDirectoryErrors<T>(action: () => Promise<T>) {
  return mapKnownCoreError(action, isDirectoryError, (error) => ({
    appCode: error.code,
    message: error.message,
    code:
      error.code === 'directory.not_found'
        ? 'NOT_FOUND'
        : error.code === 'directory.invalid_reference'
          ? 'BAD_REQUEST'
          : 'CONFLICT',
  }));
}
export const contractingDirectoryRouter = router({
  customers: router({
    list: authorizedProcedure('contracting_directory:read').query(({ ctx }) =>
      mapDirectoryErrors(() => listCustomers({ db: ctx.db })),
    ),
    get: authorizedProcedure('contracting_directory:read')
      .input(idInput)
      .query(({ ctx, input }) => mapDirectoryErrors(() => getCustomer({ db: ctx.db, id: input.id }))),
    create: authorizedProcedure('contracting_directory:update')
      .input(CustomerCreateInput)
      .mutation(({ ctx, input }) =>
        mapDirectoryErrors(() => createCustomer({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    patch: authorizedProcedure('contracting_directory:update')
      .input(CustomerPatchInput)
      .mutation(({ ctx, input }) =>
        mapDirectoryErrors(() => patchCustomer({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
  }),
  farms: router({
    list: authorizedProcedure('contracting_directory:read')
      .input(FarmListInput)
      .query(({ ctx, input }) => mapDirectoryErrors(() => listFarms({ db: ctx.db, customerId: input.customerId }))),
    create: authorizedProcedure('contracting_directory:update')
      .input(FarmCreateInput)
      .mutation(({ ctx, input }) =>
        mapDirectoryErrors(() => createFarm({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    patch: authorizedProcedure('contracting_directory:update')
      .input(FarmPatchInput)
      .mutation(({ ctx, input }) =>
        mapDirectoryErrors(() => patchFarm({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    remove: authorizedProcedure('contracting_directory:update')
      .input(FarmIdInput)
      .mutation(({ ctx, input }) =>
        mapDirectoryErrors(() => removeFarm({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
  }),
  workTypes: router({
    list: authorizedProcedure('contracting_directory:read').query(({ ctx }) =>
      mapDirectoryErrors(() => listWorkTypes({ db: ctx.db })),
    ),
    options: authorizedProcedure('contracting_directory:read').query(({ ctx }) =>
      mapDirectoryErrors(() => workTypeOptions({ db: ctx.db })),
    ),
    get: authorizedProcedure('contracting_directory:read')
      .input(idInput)
      .query(({ ctx, input }) => mapDirectoryErrors(() => getWorkType({ db: ctx.db, id: input.id }))),
    create: authorizedProcedure('contracting_directory:update')
      .input(WorkTypeCreateInput)
      .mutation(({ ctx, input }) =>
        mapDirectoryErrors(() => createWorkType({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    patch: authorizedProcedure('contracting_directory:update')
      .input(WorkTypePatchInput)
      .mutation(({ ctx, input }) =>
        mapDirectoryErrors(() => patchWorkType({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
  }),
});

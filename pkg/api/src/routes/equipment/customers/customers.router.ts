import {
  createCustomer,
  findPossibleCustomerMatches,
  getCustomer,
  getCustomerMergePreview,
  listCustomers,
  mergeCustomer,
  removeCustomer,
  updateCustomer,
} from '@pkg/core/equipment';
import { UUID } from '@pkg/schema';
import {
  CustomerCreateInput,
  CustomerListInput,
  CustomerMergeInput,
  CustomerPossibleMatch,
  CustomerPossibleMatchInput,
  CustomerUpdateInput,
} from '@pkg/schema/equipment';
import { z } from 'zod';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { customerErrorFamily } from '../equipment-error-families.js';

export const customersRouter = router({
  findPossibleMatches: authorizedProcedure(['equipment_customer:create', 'equipment_quote:create'])
    .input(CustomerPossibleMatchInput)
    .output(z.array(CustomerPossibleMatch))
    .query(({ ctx, input }) => findPossibleCustomerMatches({ db: ctx.db, companyName: input.companyName })),

  list: authorizedProcedure('equipment_customer:read')
    .input(CustomerListInput)
    .query(({ ctx, input }) => listCustomers({ db: ctx.db, input })),

  get: authorizedProcedure('equipment_customer:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapCoreErrors(() => getCustomer({ db: ctx.db, id: input.id }), customerErrorFamily)),

  create: authorizedProcedure('equipment_customer:create')
    .input(CustomerCreateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => createCustomer({ db: ctx.db, input, actorUserId: ctx.session.user.id }), customerErrorFamily),
    ),

  update: authorizedProcedure('equipment_customer:update')
    .input(CustomerUpdateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => updateCustomer({ db: ctx.db, input, actorUserId: ctx.session.user.id }), customerErrorFamily),
    ),

  mergePreview: authorizedProcedure('equipment_customer:merge')
    .input(z.object({ sourceId: UUID }))
    .query(({ ctx, input }) =>
      mapCoreErrors(() => getCustomerMergePreview({ db: ctx.db, sourceId: input.sourceId }), customerErrorFamily),
    ),

  merge: authorizedProcedure('equipment_customer:merge')
    .input(CustomerMergeInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => mergeCustomer({ db: ctx.db, input, actorUserId: ctx.session.user.id }), customerErrorFamily),
    ),

  remove: authorizedProcedure('equipment_customer:remove')
    .input(z.object({ id: UUID }))
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => removeCustomer({ db: ctx.db, id: input.id, actorUserId: ctx.session.user.id }),
        customerErrorFamily,
      ),
    ),
});

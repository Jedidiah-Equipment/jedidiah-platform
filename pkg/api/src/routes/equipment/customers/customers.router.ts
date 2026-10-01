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
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { mapCustomerErrors } from './customer-error-mapping.js';

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
    .query(({ ctx, input }) => mapCustomerErrors(() => getCustomer({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('equipment_customer:create')
    .input(CustomerCreateInput)
    .mutation(({ ctx, input }) =>
      mapCustomerErrors(() => createCustomer({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  update: authorizedProcedure('equipment_customer:update')
    .input(CustomerUpdateInput)
    .mutation(({ ctx, input }) =>
      mapCustomerErrors(() => updateCustomer({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  mergePreview: authorizedProcedure('equipment_customer:merge')
    .input(z.object({ sourceId: UUID }))
    .query(({ ctx, input }) =>
      mapCustomerErrors(() => getCustomerMergePreview({ db: ctx.db, sourceId: input.sourceId })),
    ),

  merge: authorizedProcedure('equipment_customer:merge')
    .input(CustomerMergeInput)
    .mutation(({ ctx, input }) =>
      mapCustomerErrors(() => mergeCustomer({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  remove: authorizedProcedure('equipment_customer:remove')
    .input(z.object({ id: UUID }))
    .mutation(({ ctx, input }) =>
      mapCustomerErrors(() => removeCustomer({ db: ctx.db, id: input.id, actorUserId: ctx.session.user.id })),
    ),
});

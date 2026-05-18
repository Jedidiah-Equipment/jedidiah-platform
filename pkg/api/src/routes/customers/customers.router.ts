import {
  type CustomerCoreError,
  createCustomer,
  getCustomer,
  isCustomerCoreError,
  listCustomers,
  updateCustomer,
} from '@pkg/core';
import { CustomerCreateInput, CustomerListInput, CustomerUpdateInput, UUID } from '@pkg/schema';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const customersRouter = router({
  list: authorizedProcedure('customer:read')
    .input(CustomerListInput)
    .query(({ ctx, input }) => listCustomers({ db: ctx.db, input })),

  get: authorizedProcedure('customer:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapCustomerErrors(() => getCustomer({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('customer:create')
    .input(CustomerCreateInput)
    .mutation(({ ctx, input }) =>
      mapCustomerErrors(() => createCustomer({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  update: authorizedProcedure('customer:update')
    .input(CustomerUpdateInput)
    .mutation(({ ctx, input }) =>
      mapCustomerErrors(() => updateCustomer({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),
});

async function mapCustomerErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isCustomerCoreError, mapCustomerCoreError);
}

function mapCustomerCoreError(error: CustomerCoreError): CoreErrorMapping<CustomerCoreError['code']> {
  return customerErrorMappings[error.code];
}

const customerErrorMappings = {
  'customer.not_found': {
    appCode: 'customer.not_found',
    code: 'NOT_FOUND',
    message: 'Customer not found.',
  },
} satisfies {
  [TCode in CustomerCoreError['code']]: CoreErrorMapping<TCode>;
};

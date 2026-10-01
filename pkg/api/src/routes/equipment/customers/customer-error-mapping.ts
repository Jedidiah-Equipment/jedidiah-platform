import { type CustomerCoreError, isCustomerCoreError } from '@pkg/core/equipment';
import { type CoreErrorMapping, mapKnownCoreError } from '../../../trpc/errors.js';

export async function mapCustomerErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isCustomerCoreError, mapCustomerCoreError);
}

function mapCustomerCoreError(error: CustomerCoreError): CoreErrorMapping<CustomerCoreError['code']> {
  if (error.code === 'customer.possible_match')
    return { appCode: error.code, code: 'CONFLICT', message: error.message, metadata: error.metadata };
  return customerErrorMappings[error.code];
}

const customerErrorMappings = {
  'customer.merge_busy': {
    appCode: 'customer.merge_busy',
    code: 'CONFLICT',
    message: 'Another change is still using this customer or its records. Wait a moment and try merging again.',
  },
  'customer.merge_self': {
    appCode: 'customer.merge_self',
    code: 'BAD_REQUEST',
    message: 'A customer cannot be merged into itself.',
  },
  'customer.in_use': {
    appCode: 'customer.in_use',
    code: 'CONFLICT',
    message: 'This customer cannot be removed because another record still references it.',
  },
  'customer.not_found': {
    appCode: 'customer.not_found',
    code: 'NOT_FOUND',
    message: 'Customer not found.',
  },
} satisfies {
  [TCode in Exclude<CustomerCoreError['code'], 'customer.possible_match'>]: CoreErrorMapping<TCode>;
};

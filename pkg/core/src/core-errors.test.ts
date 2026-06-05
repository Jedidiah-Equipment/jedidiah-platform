import { describe, expect, it } from 'vitest';

import { CustomerNotFoundError, isCustomerCoreError } from './customers/customer-errors.js';
import {
  isJobCoreError,
  JobBayNotFoundError,
  JobCreateFromQuoteDeniedError,
  JobNotFoundError,
  JobSlotBookingDeniedError,
  JobSlotRemoveDeniedError,
  JobSlotResizeDeniedError,
  JobStageNotFoundError,
} from './jobs/job-errors.js';
import {
  DuplicatePartCodeError,
  isPartCoreError,
  PartNotFoundError,
  PartSupplierNotFoundError,
} from './parts/part-errors.js';
import {
  DuplicateProductModelCodeError,
  DuplicateProductNameError,
  isProductCoreError,
  ProductNotFoundError,
} from './products/product-errors.js';
import {
  isQuoteCoreError,
  QuoteDiscountInvalidError,
  QuoteInvalidReferenceError,
  QuoteNotFoundError,
} from './quotes/quote-errors.js';
import { DuplicateSupplierNameError, isSupplierCoreError, SupplierNotFoundError } from './suppliers/supplier-errors.js';
import { isUserCoreError, UserNotFoundError } from './users/user-errors.js';

describe('core error codes and guards', () => {
  it('identifies product core errors', () => {
    expect(new DuplicateProductNameError('Loader').code).toBe('product.duplicate_name');
    expect(new DuplicateProductModelCodeError('WL-100').code).toBe('product.duplicate_model_code');
    expect(new ProductNotFoundError('product-id').code).toBe('product.not_found');
    expect(isProductCoreError(new ProductNotFoundError('product-id'))).toBe(true);
    expect(isProductCoreError(new Error('product.not_found'))).toBe(false);
  });

  it('identifies part core errors', () => {
    expect(new DuplicatePartCodeError('P-100').code).toBe('part.duplicate_code');
    expect(new PartNotFoundError('part-id').code).toBe('part.not_found');
    expect(new PartSupplierNotFoundError('supplier-id').code).toBe('part.supplier_not_found');
    expect(isPartCoreError(new PartNotFoundError('part-id'))).toBe(true);
    expect(isPartCoreError(new Error('part.not_found'))).toBe(false);
  });

  it('identifies customer and user core errors', () => {
    expect(new CustomerNotFoundError('customer-id').code).toBe('customer.not_found');
    expect(new UserNotFoundError('user-id').code).toBe('user.not_found');
    expect(isCustomerCoreError(new CustomerNotFoundError('customer-id'))).toBe(true);
    expect(isUserCoreError(new UserNotFoundError('user-id'))).toBe(true);
  });

  it('identifies supplier core errors', () => {
    expect(new DuplicateSupplierNameError('Acme Supplies').code).toBe('supplier.duplicate_name');
    expect(new SupplierNotFoundError('supplier-id').code).toBe('supplier.not_found');
    expect(isSupplierCoreError(new SupplierNotFoundError('supplier-id'))).toBe(true);
    expect(isSupplierCoreError(new Error('supplier.not_found'))).toBe(false);
  });

  it('identifies quote core errors', () => {
    expect(new QuoteNotFoundError('quote-id').code).toBe('quote.not_found');
    expect(new QuoteDiscountInvalidError('diagnostic').code).toBe('quote.discount_invalid');
    expect(new QuoteInvalidReferenceError('diagnostic').code).toBe('quote.invalid_reference');
    expect(isQuoteCoreError(new QuoteNotFoundError('quote-id'))).toBe(true);
  });

  it('identifies job core errors', () => {
    expect(new JobNotFoundError('job-id').code).toBe('job.not_found');
    expect(new JobCreateFromQuoteDeniedError('diagnostic').code).toBe('job.create_from_quote_denied');
    expect(new JobBayNotFoundError('bay-id').code).toBe('job.bay_not_found');
    expect(new JobStageNotFoundError('stage-id').code).toBe('job.stage_not_found');
    expect(new JobSlotBookingDeniedError('diagnostic').code).toBe('job.slot_booking_denied');
    expect(new JobSlotResizeDeniedError('diagnostic').code).toBe('job.slot_resize_denied');
    expect(new JobSlotRemoveDeniedError('diagnostic').code).toBe('job.slot_remove_denied');
    expect(isJobCoreError(new JobCreateFromQuoteDeniedError('diagnostic'))).toBe(true);
  });
});

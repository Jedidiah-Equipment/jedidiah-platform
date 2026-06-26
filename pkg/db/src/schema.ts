export * from './schema/audit.js';
export * from './schema/auth.js';
export * from './schema/customer.js';
export * from './schema/document.js';
export * from './schema/feedback.js';
export * from './schema/job.js';
export * from './schema/part.js';
export * from './schema/product.js';
export * from './schema/product-range.js';
export * from './schema/quote.js';
export * from './schema/stored-file.js';
export * from './schema/supplier.js';

import * as auditSchema from './schema/audit.js';
import * as authSchema from './schema/auth.js';
import * as customerSchema from './schema/customer.js';
import * as documentSchema from './schema/document.js';
import * as feedbackSchema from './schema/feedback.js';
import * as jobSchema from './schema/job.js';
import * as partSchema from './schema/part.js';
import * as productSchema from './schema/product.js';
import * as productRangeSchema from './schema/product-range.js';
import * as quoteSchema from './schema/quote.js';
import * as supplierSchema from './schema/supplier.js';

export const schema = {
  ...auditSchema,
  ...authSchema,
  ...customerSchema,
  ...documentSchema,
  ...feedbackSchema,
  ...jobSchema,
  ...partSchema,
  ...productRangeSchema,
  ...productSchema,
  ...quoteSchema,
  ...supplierSchema,
};

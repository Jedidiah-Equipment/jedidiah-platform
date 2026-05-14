export * from './schema/audit.js';
export * from './schema/auth.js';
export * from './schema/product.js';
export * from './schema/product-option.js';

import * as auditSchema from './schema/audit.js';
import * as authSchema from './schema/auth.js';
import * as productSchema from './schema/product.js';
import * as productOptionSchema from './schema/product-option.js';

export const schema = {
  ...auditSchema,
  ...authSchema,
  ...productSchema,
  ...productOptionSchema,
};

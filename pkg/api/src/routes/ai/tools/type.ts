import type { GetCustomerTool } from './get-customer.js';
import type { GetJobTool } from './get-job.js';
import type { GetProductTool } from './get-product.js';
import type { GetQuoteTool } from './get-quote.js';
import type { ListAuditEventsTool } from './list-audit-events.js';
import type { ListCustomersTool } from './list-customers.js';
import type { ListJobsTool } from './list-jobs.js';
import type { ListProductsTool } from './list-products.js';
import type { ListQuoteCustomersTool } from './list-quote-customers.js';
import type { ListQuoteProductsTool } from './list-quote-products.js';
import type { ListQuoteSalespeopleTool } from './list-quote-salespeople.js';
import type { ListQuotesTool } from './list-quotes.js';
import type { ListUsersTool } from './list-users.js';

export type AiTool =
  | GetCustomerTool
  | GetJobTool
  | GetProductTool
  | GetQuoteTool
  | ListAuditEventsTool
  | ListCustomersTool
  | ListJobsTool
  | ListProductsTool
  | ListQuoteCustomersTool
  | ListQuoteProductsTool
  | ListQuoteSalespeopleTool
  | ListQuotesTool
  | ListUsersTool;

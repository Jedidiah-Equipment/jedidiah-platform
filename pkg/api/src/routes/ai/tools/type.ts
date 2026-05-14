import type { ListAuditEventsTool } from './list-audit-events.js';
import type { ListProductsTool } from './list-products.js';
import type { ListUsersTool } from './list-users.js';

export type AiTool = ListAuditEventsTool | ListProductsTool | ListUsersTool;

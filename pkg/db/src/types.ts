import type { Database } from './database-client.js';

export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

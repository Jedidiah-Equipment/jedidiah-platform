import type { Db } from './database-client.js';

export type DatabaseTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

export { sql } from 'drizzle-orm';
export { closeDatabaseConnection, db, queryClient } from './client.js';
export { createDatabaseClient, type DatabaseClient, type Db } from './database-client.js';
export { getDatabaseConfig, getDatabaseUrl } from './env.js';
export {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  createLikeSearchPattern,
  getForeignKeyViolationConstraint,
  getPaginationOffset,
  getPaginationQueryOptions,
  getSortOrder,
  getUniqueViolationConstraint,
  isUniqueViolation,
  LIKE_SEARCH_ESCAPE,
  withPagination,
} from './query-utils.js';
export * from './schema.js';
export {
  buildDatabaseUrl,
  type CreateEphemeralTestDatabaseOptions,
  createEphemeralTestDatabase,
  createTestDatabaseName,
  dropTestDatabase,
  type EphemeralTestDatabase,
  getTestTemplateDatabaseUrl,
  type RecreateTestTemplateDatabaseOptions,
  recreateTestTemplateDatabase,
} from './test-utils.js';
export type { DatabaseTransaction } from './types.js';

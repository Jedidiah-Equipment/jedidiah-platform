export { and, eq, isNull, sql } from 'drizzle-orm';
export { closeDatabaseConnection, db, queryClient } from './client.js';
export { createDatabaseClient, type DatabaseClient, type Db } from './database-client.js';
export { getDatabaseConfig, getDatabaseUrl } from './env.js';
export {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  createLikeSearchPattern,
  getForeignKeyViolationConstraint,
  getPaginationQueryOptions,
  getSortOrder,
  getUniqueViolationConstraint,
  isUniqueViolation,
  LIKE_SEARCH_ESCAPE,
  notRemoved,
  withPagination,
} from './query-utils.js';
export * from './schema/audit.js';
export * from './schema/auth.js';
export * from './schema/changelog.js';
export * from './schema/stored-file.js';
export { schema } from './schema.js';
export {
  buildDatabaseUrl,
  type CreateEphemeralTestDatabaseOptions,
  createEphemeralTestDatabase,
  createTestDatabaseName,
  dropTestDatabase,
  dropTrackedTestDatabases,
  type EphemeralTestDatabase,
  getTestTemplateDatabaseUrl,
  type RecreateTestTemplateDatabaseOptions,
  readMigrationStatements,
  recreateTestTemplateDatabase,
  sweepStaleTestDatabases,
} from './test-utils.js';
export type { DatabaseTransaction } from './types.js';

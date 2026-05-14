import { readMigrationFiles } from 'drizzle-orm/migrator';

import { recreateTestTemplateDatabase } from './test-utils.js';

const templateDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!templateDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for the test template database');
}

const templateDatabaseName = new URL(templateDatabaseUrl).pathname.slice(1);
const migrationsFolder = new URL('../migrations', import.meta.url).pathname;
const migrations = readMigrationFiles({ migrationsFolder });

console.info(`[db:up:template] Recreating template database "${templateDatabaseName}"`);
console.info(`[db:up:template] Applying ${migrations.length} Drizzle migration(s) from ${migrationsFolder}`);

await recreateTestTemplateDatabase();

console.info(`[db:up:template] Template database "${templateDatabaseName}" is ready`);

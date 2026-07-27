import { sweepStaleTestDatabases } from './test-utils.js';

export default async function runTestDatabaseGlobalSetup(): Promise<void> {
  try {
    await sweepStaleTestDatabases();
  } catch (error) {
    console.warn('[test database cleanup] Unable to sweep stale test databases; continuing the test run.', error);
  }
}

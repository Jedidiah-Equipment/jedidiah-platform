/**
 * A DB-backed test clones the template database and seeds real fixtures, and its `afterAll` drops every
 * ephemeral database the file created — real work against a Postgres shared with the rest of the run,
 * and with the other parallel slots on the same box. Vitest's defaults (5s test, 10s hook) leave too
 * little room for that under load, and the teardown hook has blown its budget here before. A genuinely
 * stuck test or hook still fails, just later.
 */
export const databaseTestTimeout = 15_000;

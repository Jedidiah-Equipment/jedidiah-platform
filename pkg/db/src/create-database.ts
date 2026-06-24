import postgres from 'postgres';

import { getDatabaseUrl } from './env.js';

// Ensures the database named in DATABASE_URL exists, creating it if missing.
// Idempotent: a no-op when docker-compose already provisioned the dev database
// (it creates POSTGRES_DB on init), so it is safe to run from any checkout.

function getDatabaseName(databaseUrl: string): string {
  const databaseName = new URL(databaseUrl).pathname.slice(1);

  if (!databaseName) {
    throw new Error(`Database URL must include a database name: ${databaseUrl}`);
  }

  return databaseName;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid database identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

const databaseUrl = getDatabaseUrl();
const databaseName = getDatabaseName(databaseUrl);

const adminUrl = new URL(databaseUrl);
adminUrl.pathname = '/postgres';
const adminClient = postgres(adminUrl.toString(), { max: 1 });

try {
  const [row] = await adminClient<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${databaseName}) AS "exists"
  `;

  if (row?.exists) {
    console.log(`Database ${databaseName} already exists.`);
  } else {
    await adminClient.unsafe(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    console.log(`Created database ${databaseName}.`);
  }
} finally {
  await adminClient.end();
}

import postgres from 'postgres';
import { expect, it } from 'vitest';

import { createEphemeralTestDatabase, readMigrationStatements } from './test-utils.js';

const migrationTag = '0131_tiresome_spacker_dave';

it('moves existing equipment data and code sequences without leaving business tables in public', async () => {
  const { databaseUrl } = await createEphemeralTestDatabase();
  const client = postgres(databaseUrl, { max: 1 });
  const migrationStatements = readMigrationStatements(migrationTag);

  try {
    await client`INSERT INTO equipment.customers (company_name) VALUES ('Migration survivor')`;

    // Recreate the immediately pre-migration layout so this test exercises the committed migration
    // against existing rows rather than merely inspecting a database already migrated from empty.
    for (const statement of [...migrationStatements].reverse()) {
      if (statement.startsWith('ALTER TABLE')) {
        await client.unsafe(
          statement
            .replace('ALTER TABLE "public".', 'ALTER TABLE "equipment".')
            .replace('SET SCHEMA "equipment"', 'SET SCHEMA "public"'),
        );
      } else if (statement.startsWith('ALTER SEQUENCE')) {
        await client.unsafe(
          statement
            .replace('ALTER SEQUENCE "public".', 'ALTER SEQUENCE "equipment".')
            .replace('SET SCHEMA "equipment"', 'SET SCHEMA "public"'),
        );
      }
    }

    expect(migrationStatements[0]).toBe('CREATE SCHEMA "equipment";');
    // Later migrations may add more equipment objects. Leave their schema in place and replay only
    // this migration's metadata moves so the regression remains valid as the database grows.
    for (const statement of migrationStatements.slice(1)) {
      await client.unsafe(statement);
    }

    const survivingCustomers = await client<{ companyName: string }[]>`
      SELECT company_name AS "companyName"
      FROM equipment.customers
      WHERE company_name = 'Migration survivor'
    `;
    const publicTables = await client<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    const equipmentSequences = await client<{ sequenceName: string }[]>`
      SELECT sequence_name AS "sequenceName"
      FROM information_schema.sequences
      WHERE sequence_schema = 'equipment'
      ORDER BY sequence_name
    `;

    expect(survivingCustomers).toEqual([{ companyName: 'Migration survivor' }]);
    expect(publicTables.map(({ tablename }) => tablename)).toEqual([
      'account',
      'audit_events',
      'changelog_view',
      'session',
      'user',
      'verification',
    ]);
    expect(equipmentSequences.map(({ sequenceName }) => sequenceName)).toEqual([
      'job_code_seq',
      'purchase_order_code_seq',
      'quote_code_seq',
    ]);
  } finally {
    await client.end();
  }
});

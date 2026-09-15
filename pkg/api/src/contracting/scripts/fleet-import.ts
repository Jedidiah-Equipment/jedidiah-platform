import { createDatabaseClient, eq, user } from '@pkg/db';
import { AuthId } from '@pkg/schema';
import { createSharedAuth } from '@/auth/auth.js';
import { log } from '@/logger.js';
import { driverRoleSafetyPlugin } from '../auth/driver-role-safety.js';
import { parseFleetImport, readFleetImportFiles } from './fleet-import-csv.js';
import { runFleetImport } from './fleet-import-runner.js';
import { resolveFleetImportConfig } from './fleet-import-target.js';

const config = resolveFleetImportConfig();
const data = parseFleetImport(await readFleetImportFiles(config.directory));

const client = createDatabaseClient(config.databaseUrl, { max: 4 });
try {
  const [actor] = await client.db.select({ id: user.id }).from(user).where(eq(user.email, config.actorEmail));
  if (!actor) throw new Error(`No user with email ${config.actorEmail} exists on ${config.target} to act as.`);
  log.root.info(
    { target: config.target, directory: config.directory, actor: config.actorEmail, rows: rowCounts(data) },
    'Fleet import starting',
  );
  const summary = await runFleetImport({
    db: client.db,
    auth: createSharedAuth(client.db, [driverRoleSafetyPlugin(client.db)]),
    actorUserId: AuthId.parse(actor.id),
    data,
  });
  for (const warning of summary.warnings) log.root.warn(warning);
  log.root.info(summary, 'Fleet import complete');
} finally {
  await client.close();
}

function rowCounts(rows: typeof data) {
  return {
    categories: rows.categories.length,
    machines: rows.machines.length,
    implements: rows.implements.length,
    people: rows.people.length,
  };
}

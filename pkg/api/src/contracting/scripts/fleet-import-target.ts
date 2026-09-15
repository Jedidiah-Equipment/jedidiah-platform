import {
  assertLocalDatabaseTarget,
  type DatabaseTarget,
  databaseTargets,
  requireDatabaseUrl,
  resolveConfirmedRemoteDatabaseUrl,
} from '@pkg/db';
import { z } from 'zod';

export type FleetImportConfig = {
  target: DatabaseTarget;
  databaseUrl: string;
  directory: string;
  actorEmail: string;
};

const Target = z.enum(databaseTargets);

// The target is named twice, and the other environments must be configured so a mislabelled URL
// can be proven distinct before the first row lands (the seed package's guard, for a script that
// may legitimately write to production).
export function resolveFleetImportConfig(env: NodeJS.ProcessEnv = process.env): FleetImportConfig {
  const parsed = Target.safeParse(env.FLEET_IMPORT_TARGET);
  if (!parsed.success)
    throw new Error(`FLEET_IMPORT_TARGET must be one of ${databaseTargets.join(', ')} to run the fleet import.`);
  const target = parsed.data;
  const action = `importing the fleet into ${target}`;
  if (env.CONFIRM_FLEET_IMPORT !== target)
    throw new Error(`Importing the fleet into ${target} requires CONFIRM_FLEET_IMPORT=${target}.`);
  let databaseUrl: string;
  if (target === 'local') {
    databaseUrl = requireDatabaseUrl(target, action, env);
    assertLocalDatabaseTarget(databaseUrl, action, env);
  } else {
    databaseUrl = resolveConfirmedRemoteDatabaseUrl({
      target,
      confirmation: { variable: 'CONFIRM_FLEET_IMPORT', value: target },
      action,
      env,
    });
  }
  return {
    target,
    databaseUrl,
    directory: requireEnv('FLEET_IMPORT_DIR', action, env),
    actorEmail: requireEnv('FLEET_IMPORT_ACTOR_EMAIL', action, env),
  };
}

function requireEnv(name: string, action: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required for ${action}.`);
  return value;
}

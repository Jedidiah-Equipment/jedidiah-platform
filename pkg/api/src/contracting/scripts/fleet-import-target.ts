import { databaseTargetsMatch, isLoopbackHostname } from '@pkg/db';

export const fleetImportTargets = ['local', 'staging', 'production'] as const;
export type FleetImportTarget = (typeof fleetImportTargets)[number];

export type FleetImportConfig = {
  target: FleetImportTarget;
  databaseUrl: string;
  directory: string;
  actorEmail: string;
};

const urlVariable: Record<FleetImportTarget, string> = {
  local: 'DATABASE_URL',
  staging: 'STAGING_DATABASE_URL',
  production: 'PRODUCTION_DATABASE_URL',
};

// The target is named twice, and the other environments must be configured so a mislabelled URL
// can be proven distinct before the first row lands (the seed package's guard, for a script that
// may legitimately write to production).
export function resolveFleetImportConfig(env: NodeJS.ProcessEnv = process.env): FleetImportConfig {
  const target = env.FLEET_IMPORT_TARGET;
  if (!isTarget(target))
    throw new Error(`FLEET_IMPORT_TARGET must be one of ${fleetImportTargets.join(', ')} to run the fleet import.`);
  if (env.CONFIRM_FLEET_IMPORT !== target)
    throw new Error(`Importing the fleet into ${target} requires CONFIRM_FLEET_IMPORT=${target}.`);

  const databaseUrl = requireEnv(urlVariable[target], target, env);
  if (target === 'local') {
    if (!isLoopbackHostname(new URL(databaseUrl).hostname))
      throw new Error('Refusing a local fleet import because DATABASE_URL is not a loopback database.');
    for (const other of ['staging', 'production'] as const) {
      const otherUrl = env[urlVariable[other]];
      if (otherUrl && databaseTargetsMatch(databaseUrl, otherUrl))
        throw new Error(`Refusing a local fleet import because DATABASE_URL matches ${urlVariable[other]}.`);
    }
  } else {
    if (env.APP_ENV !== target)
      throw new Error(`Importing the fleet into ${target} requires APP_ENV=${target}, like the seed writers.`);
    const other = target === 'staging' ? 'production' : 'staging';
    const otherUrl = requireEnv(urlVariable[other], target, env);
    if (databaseTargetsMatch(databaseUrl, otherUrl))
      throw new Error(`Refusing the fleet import because the ${target} and ${other} databases match.`);
  }

  return {
    target,
    databaseUrl,
    directory: requireEnv('FLEET_IMPORT_DIR', target, env),
    actorEmail: requireEnv('FLEET_IMPORT_ACTOR_EMAIL', target, env),
  };
}

function isTarget(value: string | undefined): value is FleetImportTarget {
  return fleetImportTargets.includes(value as FleetImportTarget);
}

function requireEnv(name: string, target: FleetImportTarget, env: NodeJS.ProcessEnv): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required to import the fleet into ${target}.`);
  return value;
}

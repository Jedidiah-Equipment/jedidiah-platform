/**
 * Whether two connection URLs name the same database. Credentials and connection options never
 * change which database receives a destructive statement, so only protocol, host, port and path
 * take part.
 */
export function databaseTargetsMatch(leftUrl: string, rightUrl: string): boolean {
  return normalizeDatabaseTarget(leftUrl) === normalizeDatabaseTarget(rightUrl);
}

function normalizeDatabaseTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const protocol = url.protocol === 'postgresql:' ? 'postgres:' : url.protocol;
  const port = url.port || (protocol === 'postgres:' ? '5432' : '');
  return `${protocol}//${url.hostname.toLowerCase()}:${port}${url.pathname}`;
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}

export const databaseTargets = ['local', 'staging', 'production'] as const;
export type DatabaseTarget = (typeof databaseTargets)[number];
export type RemoteDatabaseTarget = Exclude<DatabaseTarget, 'local'>;
export const databaseUrlVariable = {
  local: 'DATABASE_URL',
  staging: 'STAGING_DATABASE_URL',
  production: 'PRODUCTION_DATABASE_URL',
} as const satisfies Record<DatabaseTarget, string>;

/** `action` is a gerund phrase ("writing the local seed snapshot") that opens every refusal. */
export function requireDatabaseUrl(target: DatabaseTarget, action: string, env: NodeJS.ProcessEnv): string {
  const value = env[databaseUrlVariable[target]];
  if (!value) throw new Error(`${databaseUrlVariable[target]} is required for ${action}.`);
  return value;
}

/**
 * A loopback database that is not a configured remote in disguise. Everyday commands stay
 * loopback-only, so a missing or misspelled remote variable is never enough to turn one into a
 * production write.
 */
export function assertLocalDatabaseTarget(databaseUrl: string, action: string, env: NodeJS.ProcessEnv): void {
  if (!isLoopbackHostname(new URL(databaseUrl).hostname))
    throw new Error(`${sentence(action)} refused because DATABASE_URL is not a loopback database.`);
  for (const remote of ['staging', 'production'] as const) {
    const remoteUrl = env[databaseUrlVariable[remote]];
    if (remoteUrl && databaseTargetsMatch(databaseUrl, remoteUrl))
      throw new Error(`${sentence(action)} refused because DATABASE_URL matches ${databaseUrlVariable[remote]}.`);
  }
}

/**
 * The remote's URL once the target is named twice (`APP_ENV` and a confirmation variable) and proven
 * distinct from the other remote, which must therefore be configured too: a mislabelled URL cannot
 * be shown safe against a remote nobody named.
 */
export function resolveConfirmedRemoteDatabaseUrl({
  target,
  confirmation,
  action,
  env,
}: {
  target: RemoteDatabaseTarget;
  confirmation: { variable: string; value: string };
  action: string;
  env: NodeJS.ProcessEnv;
}): string {
  if (env.APP_ENV !== target) throw new Error(`${sentence(action)} requires APP_ENV=${target}.`);
  if (env[confirmation.variable] !== confirmation.value)
    throw new Error(`${sentence(action)} requires ${confirmation.variable}=${confirmation.value}.`);
  const other: RemoteDatabaseTarget = target === 'staging' ? 'production' : 'staging';
  const databaseUrl = requireDatabaseUrl(target, action, env);
  const otherUrl = requireDatabaseUrl(other, action, env);
  if (databaseTargetsMatch(databaseUrl, otherUrl))
    throw new Error(`${sentence(action)} refused because the ${target} and ${other} databases match.`);
  return databaseUrl;
}

const sentence = (action: string) => action.charAt(0).toUpperCase() + action.slice(1);

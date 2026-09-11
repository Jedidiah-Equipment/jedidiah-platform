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

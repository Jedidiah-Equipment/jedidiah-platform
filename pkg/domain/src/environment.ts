import type { AppEnv } from '@pkg/schema';

export type ReleaseMetadata = {
  railwayDeploymentId?: string | null | undefined;
  railwayGitCommitSha?: string | null | undefined;
};

export function isRemoteAppEnv(appEnv: AppEnv): boolean {
  return appEnv === 'staging' || appEnv === 'production';
}

export function getReleaseMetadata(metadata: ReleaseMetadata): string | null {
  return metadata.railwayGitCommitSha ?? metadata.railwayDeploymentId ?? null;
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

/**
 * The docs origin an app builds Help links from, or `null` when it should offer no Help at all.
 *
 * The docs site is optional: with none configured there is nothing useful to open, so the apps drop
 * the affordance rather than show a link that goes nowhere. A loopback origin counts only in
 * development — every runtime package ships a committed `.env` of local defaults, so a deployed
 * service missing the variable would otherwise inherit one and send a shared tablet to itself.
 */
export function resolveDocsOrigin(value: string | null | undefined, appEnv: AppEnv): string | null {
  const origin = value?.replace(/\/+$/, '');

  if (!origin) {
    return null;
  }

  return isRemoteAppEnv(appEnv) && isLoopbackOrigin(origin) ? null : origin;
}

// Hand-parsed rather than via `URL`: this package stays browser-safe and compiles without DOM types.
function isLoopbackOrigin(origin: string): boolean {
  const authority = origin.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0] ?? '';

  return LOOPBACK_HOSTS.includes(authority) || LOOPBACK_HOSTS.includes(authority.replace(/:\d+$/, ''));
}

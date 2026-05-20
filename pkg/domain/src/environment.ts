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

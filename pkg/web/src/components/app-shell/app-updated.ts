export const APP_UPDATED_TOAST_ID = 'app-updated';
export const APP_VERSION_POLL_INTERVAL_MS = 60_000;

export type AppVersionResponse = {
  deploymentVersion: string | null;
};

export function shouldShowAppUpdatedToast(currentVersion: string | null, latestVersion: string | null): boolean {
  return Boolean(currentVersion && latestVersion && currentVersion !== latestVersion);
}

export function parseAppVersionResponse(response: unknown): AppVersionResponse {
  if (!response || typeof response !== 'object' || !('deploymentVersion' in response)) {
    return { deploymentVersion: null };
  }

  const deploymentVersion = (response as { deploymentVersion: unknown }).deploymentVersion;

  return {
    deploymentVersion: typeof deploymentVersion === 'string' && deploymentVersion.length > 0 ? deploymentVersion : null,
  };
}

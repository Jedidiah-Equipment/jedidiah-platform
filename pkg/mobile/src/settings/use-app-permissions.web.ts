import type { AppPermissionKey, AppPermissionRow } from './app-permission-rows';

/** A browser grants permissions per site, on use: mobile web lists none. */
export function useAppPermissions(): {
  rows: AppPermissionRow[];
  ask: (key: AppPermissionKey) => Promise<void>;
  openSettings: () => Promise<void>;
} {
  return { rows: [], ask: async () => undefined, openSettings: async () => undefined };
}

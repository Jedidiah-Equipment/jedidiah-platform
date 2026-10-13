import type { AppPermissions } from './app-permission-rows';

/** A browser grants permissions per site, on use: mobile web lists none. */
export function useAppPermissions(): AppPermissions {
  return { rows: [], ask: async () => undefined, openSettings: async () => undefined };
}

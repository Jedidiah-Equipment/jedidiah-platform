import type { StorageAdapter } from '@pkg/core';
import type { ApiConfig } from './env.js';
import type { RuntimeService } from './runtime-service.js';

export type BusinessWiringInput = { config: ApiConfig; storage: StorageAdapter };

/** What a business hands back after registering its HTTP routes: what its routers close over, and what to run. */
export type BusinessWiring<TRouterDependencies> = {
  routerDependencies: TRouterDependencies;
  services: readonly RuntimeService[];
};

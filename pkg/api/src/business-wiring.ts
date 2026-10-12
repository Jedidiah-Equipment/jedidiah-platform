import type { PushSender, StorageAdapter } from '@pkg/core';
import type { Db } from '@pkg/db';
import type { ApiConfig } from './env.js';
import type { RuntimeService } from './runtime-service.js';

/** What both businesses are built from: config, the database, file storage, and the business-blind push transport. */
export type BusinessWiringInput = { config: ApiConfig; db: Db; storage: StorageAdapter; push: PushSender };

/** What a business hands back after registering its HTTP routes: what its routers close over, and what to run. */
export type BusinessWiring<TRouterDependencies> = {
  routerDependencies: TRouterDependencies;
  services: readonly RuntimeService[];
};

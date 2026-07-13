import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadChangelogs } from '@pkg/changelog';

import type { ChangelogLoader } from '@/trpc/context.js';

/** Walks up from this module to the workspace root (the directory holding `pnpm-workspace.yaml`). */
function findWorkspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) return dirname(fileURLToPath(import.meta.url));
    dir = parent;
  }
  return dir;
}

/**
 * The production Changelog loader: reads and validates the changelog files committed under the
 * workspace-root `changelogs/` directory. A missing directory simply yields no changelogs.
 */
export function createFileChangelogLoader(dir: string = join(findWorkspaceRoot(), 'changelogs')): ChangelogLoader {
  return () => loadChangelogs(dir);
}

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadChangelogs } from '@pkg/changelog';

import type { ChangelogLoader } from '@/trpc/context.js';

/**
 * Walks up from this module to the workspace root (the directory holding `pnpm-workspace.yaml`).
 * Throws rather than guessing: a silent fallback would make a packaging problem indistinguishable
 * from "no changelogs released".
 */
function findWorkspaceRoot(): string {
  const start = dirname(fileURLToPath(import.meta.url));
  let dir = start;
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Cannot locate the workspace root (no pnpm-workspace.yaml above ${start}).`);
    }
    dir = parent;
  }
  return dir;
}

/**
 * The production Changelog loader: reads and validates the changelog files committed under the
 * workspace-root `changelogs/` directory. The files are immutable for the process lifetime (a new
 * changelog ships in a new deploy), so they are read once at startup, not per request. A missing
 * directory simply yields no changelogs.
 */
export function createFileChangelogLoader(dir: string = join(findWorkspaceRoot(), 'changelogs')): ChangelogLoader {
  const changelogs = loadChangelogs(dir);
  return () => changelogs;
}

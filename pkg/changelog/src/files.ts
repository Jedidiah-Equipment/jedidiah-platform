import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Changelog } from '@pkg/schema';

import type { ChangelogFileRef } from './prune.js';

/** The changelog `*.json` filenames present in `dir`, or none if the directory does not exist. */
function jsonFilenames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.json'));
}

/** Lists changelog `*.json` files in `dir` with their release timestamps. Malformed files are skipped. */
export function listChangelogFiles(dir: string): ChangelogFileRef[] {
  const refs: ChangelogFileRef[] = [];
  for (const name of jsonFilenames(dir)) {
    const path = join(dir, name);
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { releasedAt?: unknown };
      if (typeof parsed.releasedAt === 'string') refs.push({ path, releasedAt: parsed.releasedAt });
    } catch {
      // A file we cannot read is left in place rather than silently pruned.
    }
  }
  return refs;
}

/** The base names (no extension) already taken in `dir`, for same-day disambiguation. */
export function existingBasenames(dir: string): string[] {
  return jsonFilenames(dir).map((name) => name.slice(0, -'.json'.length));
}

/** Writes a changelog to `<dir>/<basename>.json` (pretty-printed, trailing newline) and returns the path. */
export function writeChangelogFile(dir: string, basename: string, changelog: Changelog): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${basename}.json`);
  writeFileSync(path, `${JSON.stringify(changelog, null, 2)}\n`);
  return path;
}

/** Removes the given files. */
export function removeFiles(paths: readonly string[]): void {
  for (const path of paths) rmSync(path, { force: true });
}

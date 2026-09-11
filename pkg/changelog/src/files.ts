import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BUSINESSES, type Business, type Changelog } from '@pkg/schema';

import type { ChangelogFileRef } from './prune.js';
import { validateChangelogJson } from './validate.js';

/** The directory holding one business's changelogs beneath the changelogs root. */
export function businessDir(root: string, business: Business): string {
  return join(root, business);
}

/** The changelog `*.json` filenames present in `dir`, or none if the directory does not exist. */
function jsonFilenames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.json'));
}

/** Lists changelog `*.json` files across every business directory with their release timestamps. Malformed files are skipped. */
export function listChangelogFiles(root: string): ChangelogFileRef[] {
  const refs: ChangelogFileRef[] = [];
  for (const business of BUSINESSES) {
    const dir = businessDir(root, business);
    for (const name of jsonFilenames(dir)) {
      const path = join(dir, name);
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as { releasedAt?: unknown };
        if (typeof parsed.releasedAt === 'string') refs.push({ path, releasedAt: parsed.releasedAt });
      } catch {
        // A file we cannot read is left in place rather than silently pruned.
      }
    }
  }
  return refs;
}

/**
 * Reads and validates every changelog beneath `root`, returning the valid ones. A file must carry the
 * business of the directory it sits in. Unreadable or invalid files are skipped.
 */
export function loadChangelogs(root: string): Changelog[] {
  const changelogs: Changelog[] = [];
  for (const business of BUSINESSES) {
    const dir = businessDir(root, business);
    for (const name of jsonFilenames(dir)) {
      let text: string;
      try {
        text = readFileSync(join(dir, name), 'utf8');
      } catch {
        continue;
      }
      const result = validateChangelogJson(text, { business });
      if (result.ok) changelogs.push(result.changelog);
    }
  }
  return changelogs;
}

/** The base names (no extension) already taken in a business directory, for same-day disambiguation. */
export function existingBasenames(root: string, business: Business): string[] {
  return jsonFilenames(businessDir(root, business)).map((name) => name.slice(0, -'.json'.length));
}

/** Every changelog `*.json` path beneath `root`, paired with the business its directory claims. */
export function listJsonPaths(root: string): { path: string; business: Business }[] {
  return BUSINESSES.flatMap((business) =>
    jsonFilenames(businessDir(root, business)).map((name) => ({
      path: join(businessDir(root, business), name),
      business,
    })),
  );
}

/** Writes a changelog to `<root>/<business>/<basename>.json` (pretty-printed, trailing newline) and returns the path. */
export function writeChangelogFile(root: string, basename: string, changelog: Changelog): string {
  const dir = businessDir(root, changelog.business);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${basename}.json`);
  writeFileSync(path, `${JSON.stringify(changelog, null, 2)}\n`);
  return path;
}

/** Removes the given files. */
export function removeFiles(paths: readonly string[]): void {
  for (const path of paths) rmSync(path, { force: true });
}

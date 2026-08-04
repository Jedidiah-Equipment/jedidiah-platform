import { readdirSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The VitePress source directory: every markdown page the site serves lives under it. */
export const CONTENT_DIR = fileURLToPath(new URL('../content', import.meta.url));

/**
 * The links of the markdown pages that currently exist, as VitePress resolves them:
 * `index.md` becomes its directory, every other page drops the extension.
 */
export function listContentPages(contentDir: string = CONTENT_DIR): string[] {
  return collectPageLinks(contentDir, '/').sort();
}

function collectPageLinks(dir: string, prefix: string): string[] {
  const links: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (prefix === '/' && entry.name === 'public') continue;
      links.push(...collectPageLinks(resolve(dir, entry.name), `${posix.join(prefix, entry.name)}/`));
      continue;
    }

    if (!entry.name.endsWith('.md')) continue;
    const name = entry.name.slice(0, -'.md'.length);
    links.push(name === 'index' ? prefix : prefix + name);
  }

  return links;
}

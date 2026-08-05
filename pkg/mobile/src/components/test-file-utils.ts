import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export function listTsxFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listTsxFiles(path) : entry.name.endsWith('.tsx') ? [path] : [];
  });
}

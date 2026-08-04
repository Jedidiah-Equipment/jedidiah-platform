import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_DIR, listContentPages } from './pages';

function fixture(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'docs-pages-'));
  for (const file of files) {
    const target = join(dir, file);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, '# page\n');
  }
  return dir;
}

describe('listContentPages', () => {
  it('maps the root index to the site root', () => {
    expect(listContentPages(fixture(['index.md']))).toEqual(['/']);
  });

  it('maps a nested page to its extensionless link', () => {
    expect(listContentPages(fixture(['inventory/post-a-receipt.md']))).toEqual(['/inventory/post-a-receipt']);
  });

  it('maps a nested index to its directory link', () => {
    expect(listContentPages(fixture(['inventory/index.md']))).toEqual(['/inventory/']);
  });

  it('ignores non-markdown files and the public directory', () => {
    const dir = fixture(['index.md', 'public/robots.txt', 'inventory/diagram.png']);
    expect(listContentPages(dir)).toEqual(['/']);
  });

  it('returns links in a stable sorted order', () => {
    const dir = fixture(['inventory/return-to-store.md', 'index.md', 'inventory/post-a-receipt.md']);
    expect(listContentPages(dir)).toEqual(['/', '/inventory/post-a-receipt', '/inventory/return-to-store']);
  });

  it('reads the package content directory by default', () => {
    expect(listContentPages()).toContain('/');
    expect(CONTENT_DIR.endsWith('content')).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { docsConfig } from './config';
import { BRAND_FAVICON_PATH, DOCS_FAVICON_PATH, FAVICON_FILENAME } from './favicon';

describe('the favicon', () => {
  it('is the brand asset, byte for byte', () => {
    expect(readFileSync(DOCS_FAVICON_PATH).equals(readFileSync(BRAND_FAVICON_PATH))).toBe(true);
  });

  it('is the icon every page links to', () => {
    expect(docsConfig.head).toContainEqual(['link', { rel: 'icon', type: 'image/png', href: `/${FAVICON_FILENAME}` }]);
  });
});

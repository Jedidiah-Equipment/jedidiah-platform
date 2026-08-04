import { describe, expect, it } from 'vitest';
import { buildSidebar, DOCS_SECTIONS } from './sidebar';

const SECTIONS = [
  {
    text: 'Inventory tasks',
    items: [
      { text: 'Post a Receipt', link: '/inventory/post-a-receipt' },
      { text: 'Return Parts to Store', link: '/inventory/return-to-store' },
    ],
  },
  {
    text: 'Inventory concepts',
    items: [{ text: 'How stock costs work', link: '/inventory/how-stock-costs-work' }],
  },
];

describe('buildSidebar', () => {
  it('lists only pages that exist', () => {
    expect(buildSidebar(SECTIONS, ['/inventory/post-a-receipt'])).toEqual([
      { text: 'Inventory tasks', items: [{ text: 'Post a Receipt', link: '/inventory/post-a-receipt' }] },
    ]);
  });

  it('hides a section whose pages do not exist yet', () => {
    const sidebar = buildSidebar(SECTIONS, ['/inventory/how-stock-costs-work']);
    expect(sidebar.map((section) => section.text)).toEqual(['Inventory concepts']);
  });

  it('returns nothing when no documented page exists', () => {
    expect(buildSidebar(SECTIONS, ['/'])).toEqual([]);
  });

  it('keeps the declared order rather than the discovery order', () => {
    const sidebar = buildSidebar(SECTIONS, ['/inventory/return-to-store', '/inventory/post-a-receipt']);
    expect(sidebar[0]?.items.map((item) => item.link)).toEqual([
      '/inventory/post-a-receipt',
      '/inventory/return-to-store',
    ]);
  });
});

describe('DOCS_SECTIONS', () => {
  it('declares unique links', () => {
    const links = DOCS_SECTIONS.flatMap((section) => section.items.map((item) => item.link));
    expect(new Set(links).size).toBe(links.length);
  });

  it('declares absolute, extensionless links, or a section landing page ending in a slash', () => {
    for (const link of DOCS_SECTIONS.flatMap((section) => section.items.map((item) => item.link))) {
      expect(link).toMatch(/^\/[a-z0-9-]+(\/[a-z0-9-]+)*\/?$/);
    }
  });
});

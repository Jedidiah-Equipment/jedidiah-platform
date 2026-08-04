export type DocsPage = {
  text: string;
  link: string;
};

export type DocsSection = {
  text: string;
  items: DocsPage[];
};

/**
 * The section structure of the docs site. Inventory first, task pages before concept pages.
 * A page may be declared here before it is written — `buildSidebar` hides what does not exist yet,
 * so the navigation never offers a stub.
 */
export const DOCS_SECTIONS: DocsSection[] = [
  {
    text: 'Inventory tasks',
    items: [
      { text: 'Post a Receipt', link: '/inventory/post-a-receipt' },
      { text: 'Check out Parts to a Job', link: '/inventory/check-out-parts-to-a-job' },
      { text: 'Return to Store', link: '/inventory/return-to-store' },
      { text: 'Run a stocktake session', link: '/inventory/run-a-stocktake-session' },
      { text: 'Print Part Labels', link: '/inventory/print-part-labels' },
    ],
  },
  {
    text: 'Inventory concepts',
    items: [
      { text: 'Warnings are judgments, not blocks', link: '/inventory/warnings-are-judgments' },
      { text: 'Perpetual and periodic stock', link: '/inventory/perpetual-and-periodic-stock' },
      { text: 'How stock costs work', link: '/inventory/how-stock-costs-work' },
    ],
  },
];

/** The declared structure narrowed to the pages that exist, dropping the sections left empty. */
export function buildSidebar(sections: DocsSection[], existingLinks: Iterable<string>): DocsSection[] {
  const existing = new Set(existingLinks);

  return sections
    .map((section) => ({ text: section.text, items: section.items.filter((item) => existing.has(item.link)) }))
    .filter((section) => section.items.length > 0);
}

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
    text: 'Production tasks',
    items: [
      { text: 'Find a Job', link: '/production/find-a-job' },
      { text: 'Cancel a Job', link: '/production/cancel-a-job' },
      { text: 'Catch up on Job Activity', link: '/production/catch-up-on-job-activity' },
      { text: 'Export completed Jobs', link: '/production/export-completed-jobs' },
      { text: 'Export Unit stock', link: '/production/export-unit-stock' },
      { text: 'Open a Bay plan', link: '/production/open-a-bay-plan' },
      { text: 'Delete a Bay', link: '/production/delete-a-bay' },
      { text: 'Remove a Unit', link: '/production/remove-a-unit' },
    ],
  },
  {
    text: 'Inventory tasks',
    items: [
      { text: 'Work the stores tablet', link: '/inventory/work-the-stores-tablet' },
      { text: 'Post a Receipt', link: '/inventory/post-a-receipt' },
      { text: 'Maintain Suppliers', link: '/inventory/maintain-suppliers' },
      { text: 'Add a Supplier', link: '/inventory/add-a-supplier' },
      { text: 'Update a Supplier', link: '/inventory/update-a-supplier' },
      { text: 'Remove a Supplier', link: '/inventory/remove-a-supplier' },
      { text: 'Check out Parts to a Job', link: '/inventory/check-out-parts-to-a-job' },
      { text: 'Return to Store', link: '/inventory/return-to-store' },
      { text: 'Amend a sent Purchase Order', link: '/inventory/amend-a-sent-purchase-order' },
      { text: 'Return stock to a Supplier', link: '/inventory/return-stock-to-a-supplier' },
      { text: 'Record a credit note', link: '/inventory/record-a-credit-note' },
      { text: 'Cross-check a Supplier invoice', link: '/inventory/cross-check-a-supplier-invoice' },
      { text: 'Build stock', link: '/inventory/build-stock' },
      { text: 'Post a stock adjustment', link: '/inventory/post-a-stock-adjustment' },
      { text: 'Revalue a Part', link: '/inventory/revalue-a-part' },
      { text: 'Maintain a Product cost estimate', link: '/inventory/maintain-a-product-cost-estimate' },
      { text: "Read a Job's material variance", link: '/inventory/read-a-jobs-material-variance' },
      { text: "Close out a Job's stock", link: '/inventory/close-out-a-job' },
      { text: 'Print Part Labels', link: '/inventory/print-part-labels' },
      {
        text: 'Raise Purchase Orders from the buy list',
        link: '/inventory/raise-purchase-orders-from-the-buy-list',
      },
      // Declared ahead of the workflow landing; stays hidden until the page exists.
      { text: 'Run a stocktake session', link: '/inventory/run-a-stocktake-session' },
    ],
  },
  {
    text: 'Inventory concepts',
    items: [
      { text: 'Stock on hand, Commitment, and Free Stock', link: '/inventory/stock-on-hand-and-free-stock' },
      { text: 'Perpetual and periodic Parts', link: '/inventory/perpetual-and-periodic-stock' },
      { text: 'Warnings are judgments, not blocks', link: '/inventory/warnings-are-judgments' },
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

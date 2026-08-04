/**
 * The docs path each app area sends its Help affordance to, keyed by topic.
 *
 * An area whose workflow has no page written yet points at the docs landing page, so every entry
 * always names a page that exists — a test in `@pkg/docs` walks these paths and fails when one does
 * not resolve, which is what stops a renamed doc from breaking Help on a tablet instead of in CI.
 * Repoint an entry in the same PR that writes its page.
 */
export const HELP_TOPICS = {
  home: '/',
  inventory: '/',
  inventoryCloseOut: '/',
  jobs: '/',
  parts: '/',
  products: '/',
  purchaseOrders: '/',
  quotes: '/',
  suppliers: '/',
  units: '/',
} as const satisfies Record<string, string>;

export type HelpTopic = keyof typeof HELP_TOPICS;

/** The absolute URL of a topic's page on the docs site running at `docsOrigin`. */
export function helpUrl(docsOrigin: string, topic: HelpTopic): string {
  return `${docsOrigin.replace(/\/+$/, '')}${HELP_TOPICS[topic]}`;
}

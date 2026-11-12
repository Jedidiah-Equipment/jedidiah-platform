import {
  hasQuoteStatus,
  presaleQuoteStatuses,
  type QuoteKind,
  type QuoteStage,
  type QuoteStatus,
} from '@pkg/schema/equipment';

import type { BadgeColorClassNames } from '../../theme/status-badge.js';
import { statusBadgeColorClassNames } from '../../theme/status-badge.js';
import { quoteStatusColorClassNames, quoteStatusLabels } from './quote-display.js';

/** What decides a Quote's Stage. A live Job is one not cancelled; a Quote has at most one. */
export type QuoteStageFacts = {
  status: QuoteStatus;
  kind: QuoteKind;
  isPartsSale: boolean;
  hasProductUnit: boolean;
  liveJob: 'none' | 'open' | 'completed';
  sentBack: boolean;
};

/**
 * Whether a Quote is waiting for an Administrator to complete it and send it for approval. Never set by hand:
 * finished work puts a Quote here, and a sale that sources no Job (a Parts Sale, a From Stock Quote) is here once
 * accepted. The SQL twin is `awaitsPricingCondition` in `@pkg/core/equipment`.
 */
export function awaitsPricing(facts: QuoteStageFacts): boolean {
  if (facts.status === 'accepted') {
    return (
      facts.sentBack ||
      facts.liveJob === 'completed' ||
      (facts.liveJob === 'none' && (facts.isPartsSale || facts.hasProductUnit))
    );
  }

  return facts.kind === 'custom' && hasQuoteStatus(presaleQuoteStatuses, facts.status) && facts.liveJob === 'completed';
}

export function quoteStageOf(facts: QuoteStageFacts): QuoteStage {
  return awaitsPricing(facts) ? 'awaiting-pricing' : facts.status;
}

export const quoteStageLabels: Record<QuoteStage, string> = {
  ...quoteStatusLabels,
  'awaiting-pricing': 'Awaiting pricing',
};

export const quoteStageColorClassNames = {
  ...quoteStatusColorClassNames,
  'awaiting-pricing': statusBadgeColorClassNames.orange,
} satisfies Record<QuoteStage, BadgeColorClassNames & { dot: string }>;

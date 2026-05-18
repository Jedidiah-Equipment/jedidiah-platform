import type { QuoteStatus } from '@pkg/schema';

export const QUOTE_TRANSITIONS = ['send', 'accept', 'reject'] as const;

export type QuoteTransition = (typeof QUOTE_TRANSITIONS)[number];

export type QuoteTransitionResult =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: string;
    };

export function evaluateQuoteTransition({
  from,
  transition,
}: {
  from: QuoteStatus;
  transition: QuoteTransition;
}): QuoteTransitionResult {
  if (transition === 'send' && from === 'draft') return allow();
  if ((transition === 'accept' || transition === 'reject') && from === 'sent') return allow();

  return deny(getTransitionDeniedReason({ from, transition }));
}

function getTransitionDeniedReason({ from, transition }: { from: QuoteStatus; transition: QuoteTransition }): string {
  if (from === 'accepted' || from === 'rejected') {
    return 'Quote decision is already final.';
  }

  if (transition === 'send') {
    return 'Only draft quotes can be sent.';
  }

  return 'Only sent quotes can receive a customer decision.';
}

function allow(): QuoteTransitionResult {
  return { allowed: true, reason: null };
}

function deny(reason: string): QuoteTransitionResult {
  return { allowed: false, reason };
}

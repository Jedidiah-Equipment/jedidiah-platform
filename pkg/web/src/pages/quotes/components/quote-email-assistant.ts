import type { NavigateOptions, RegisteredRouter } from '@tanstack/react-router';

import { withAssistantDraftPromptHistoryState } from '@/pages/assistant/assistant-history-state.js';

type QuoteEmailPromptQuote = {
  code: string;
  id: string;
};

type NavigateToAssistant = (
  options: NavigateOptions<RegisteredRouter, string, '/assistant'>,
) => Promise<unknown> | unknown;

export function buildQuoteEmailPrompt(quote: QuoteEmailPromptQuote): string {
  return `Draft a warm, natural customer email body for quote ${quote.code}.

Use the available quote details for quote id ${quote.id}. Address the customer appropriately and write like a real salesperson, not like a checklist or generated summary. Keep the tone professional, clear, and human, using plain business English rather than casual filler.

Cover the important commercial details in flowing paragraphs: the product, selected optional assembly options, delivery inclusion and delivery price when available, any discount offered, payment terms including the deposit percentage, the preferred delivery date, how long the quote is valid, and any notes included on the quote document.

Use a simple, natural opening such as "Thank you for the opportunity" or move directly into the quote context. Avoid awkward or overly casual phrases like "put this together for you", stiff phrases like "we are pleased to quote", "selected optional assembly options included with this quote are", or one short paragraph per fact. Do not over-repeat the quote code or customer name. If a list of options is needed, fold it into a sentence naturally.

Do not invent missing facts. If a detail is not available on the quote, omit it rather than guessing. Return only the email body.`;
}

export async function openQuoteEmailAssistant({
  flushAutosave,
  navigate,
  quote,
}: {
  flushAutosave: () => Promise<boolean>;
  navigate: NavigateToAssistant;
  quote: QuoteEmailPromptQuote;
}): Promise<boolean> {
  const didSave = await flushAutosave();

  if (!didSave) {
    return false;
  }

  await navigate({
    search: {
      newChat: true,
    },
    state: (current) => withAssistantDraftPromptHistoryState(current, buildQuoteEmailPrompt(quote)),
    to: '/assistant',
  });

  return true;
}

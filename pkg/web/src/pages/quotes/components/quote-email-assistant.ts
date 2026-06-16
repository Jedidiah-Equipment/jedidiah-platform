import { buildQuoteEmailPrompt as buildQuoteEmailPromptBase } from '@pkg/domain';
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
  return buildQuoteEmailPromptBase({ code: quote.code, quoteId: quote.id });
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

import { createFileRoute, useLocation } from '@tanstack/react-router';
import { z } from 'zod';

import { AssistantPage } from '@/pages/assistant/AssistantPage.js';
import { getAssistantDraftPromptFromHistoryState } from '@/pages/assistant/assistant-history-state.js';

export const AssistantRouteSearch = z.object({
  newChat: z
    .union([z.boolean(), z.literal(1), z.literal('1'), z.literal('true')])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value === true || value === 1 || value === '1' || value === 'true',
    ),
  prompt: z.string().optional(),
});

export const Route = createFileRoute('/_authed/assistant')({
  validateSearch: AssistantRouteSearch,
  staticData: {
    pageLabel: 'Assistant',
  },
  component: AssistantRoute,
});

function AssistantRoute() {
  const search = Route.useSearch();
  const assistantDraftPrompt = useLocation({
    select: (location) => getAssistantDraftPromptFromHistoryState(location.state),
  });

  return <AssistantPage newChat={search.newChat ?? false} prompt={search.prompt ?? assistantDraftPrompt} />;
}

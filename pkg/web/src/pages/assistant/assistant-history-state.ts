import { z } from 'zod';

export const AssistantDraftHistoryState = z
  .object({
    assistantDraftPrompt: z.string().optional(),
  })
  .passthrough();

export type AssistantDraftHistoryState = z.infer<typeof AssistantDraftHistoryState>;

export function getAssistantDraftPromptFromHistoryState(state: object): string | undefined {
  const result = AssistantDraftHistoryState.safeParse(state);

  return result.success ? result.data.assistantDraftPrompt : undefined;
}

export function withAssistantDraftPromptHistoryState<TState extends object>(
  state: TState,
  prompt: string | undefined,
): TState & AssistantDraftHistoryState {
  return {
    ...state,
    assistantDraftPrompt: prompt,
  };
}

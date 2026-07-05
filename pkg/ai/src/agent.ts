import { Agent } from '@openai/agents';
import type { AiReasoningEffort, ChatEvent } from '@pkg/schema';

import type { AiContext } from './context.js';
import { createSystemPrompt } from './prompts.js';
import { type AuthorizedAiTools, createAgentTools, getAuthorizedToolNames } from './tools.js';

/**
 * The chat stream and the quote email action must run the same assistant: one name, one system
 * prompt, one tool wiring. Both build their agent here so the surfaces cannot drift.
 */
export function createAssistantAgent({
  authorizedTools,
  model,
  onToolCall,
  onToolResult,
  reasoningEffort,
}: {
  authorizedTools: AuthorizedAiTools;
  model: string;
  onToolCall: (event: Extract<ChatEvent, { type: 'tool_call' }>) => void;
  onToolResult: (event: Extract<ChatEvent, { type: 'tool_result' }>) => void;
  reasoningEffort: AiReasoningEffort;
}): Agent<AiContext> {
  return new Agent<AiContext>({
    instructions: createSystemPrompt(getAuthorizedToolNames(authorizedTools)),
    model,
    modelSettings: {
      reasoning: {
        effort: reasoningEffort,
      },
    },
    name: 'JedidiahOps assistant',
    tools: createAgentTools(authorizedTools, onToolCall, onToolResult),
  });
}

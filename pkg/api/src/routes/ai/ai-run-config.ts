import { type AiAgentRunner, createAiAgentRunner } from '@pkg/ai';
import type { AiReasoningEffort } from '@pkg/schema';

import { getApiConfig } from '@/env.js';

export type AiRunConfig = {
  model: string;
  reasoningEffort: AiReasoningEffort;
  runner: AiAgentRunner;
};

// The one place OpenAI run settings are read from config; both the chat stream route and the
// quote draft email flow assemble their runner through here.
export function getAiRunConfig(): AiRunConfig {
  const config = getApiConfig();

  return {
    model: config.OPENAI_MODEL,
    reasoningEffort: config.OPENAI_REASONING_EFFORT,
    runner: createAiAgentRunner({ apiKey: config.OPENAI_API_KEY }),
  };
}

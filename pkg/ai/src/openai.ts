import { type Agent, type AgentInputItem, OpenAIProvider, Runner } from '@openai/agents';

import type { AiContext } from './context.js';

export type AiAgentTextStream = AsyncIterable<string | Uint8Array>;

export type AiAgentRunInput = {
  agent: Agent<AiContext>;
  context: AiContext;
  input: AgentInputItem[];
  maxTurns: number;
  signal: AbortSignal;
};

export type AiAgentRunner = {
  run: (input: AiAgentRunInput) => Promise<AiAgentTextStream>;
};

export function createAiAgentRunner({ apiKey }: { apiKey: string }): AiAgentRunner {
  const modelProvider = new OpenAIProvider({
    apiKey,
  });
  const runner = new Runner({
    modelProvider,
  });

  return {
    async run({ agent, context, input, maxTurns, signal }) {
      const result = await runner.run(agent, input, {
        context,
        maxTurns,
        signal,
        stream: true,
      });

      return result.toTextStream({
        compatibleWithNodeStreams: true,
      }) as AiAgentTextStream;
    },
  };
}

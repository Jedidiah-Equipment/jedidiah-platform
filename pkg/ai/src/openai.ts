import { type Agent, type AgentInputItem, OpenAIProvider, Runner } from '@openai/agents';
import type { ChatRunUsage } from '@pkg/schema';

import type { AiContext } from './context.js';

export type AiAgentTextStream = AsyncIterable<string | Uint8Array>;

type RequestUsageLike = {
  inputTokens: number;
  inputTokensDetails: Record<string, number>;
  outputTokens: number;
  outputTokensDetails: Record<string, number>;
  totalTokens: number;
};

type RunUsageLike = {
  inputTokens: number;
  inputTokensDetails: Array<Record<string, number>>;
  outputTokens: number;
  outputTokensDetails: Array<Record<string, number>>;
  requestUsageEntries?: RequestUsageLike[] | undefined;
  requests: number;
  totalTokens: number;
};

export type AiAgentRunInput = {
  agent: Agent<AiContext>;
  context: AiContext;
  input: AgentInputItem[];
  maxTurns: number;
  signal: AbortSignal;
};

export type AiAgentRunResult = {
  textStream: AiAgentTextStream;
  usage: () => Promise<ChatRunUsage>;
};

export type AiAgentRunner = {
  run: (input: AiAgentRunInput) => Promise<AiAgentRunResult>;
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

      return {
        textStream: result.toTextStream({
          compatibleWithNodeStreams: true,
        }) as AiAgentTextStream,
        usage: async () => {
          await result.completed;
          return toChatRunUsage(result.state.usage);
        },
      };
    },
  };
}

export function toChatRunUsage(usage: RunUsageLike): ChatRunUsage {
  return {
    cachedInputTokens: sumDetailEntries(usage.inputTokensDetails, 'cached_tokens'),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningOutputTokens: sumDetailEntries(usage.outputTokensDetails, 'reasoning_tokens'),
    requestUsage: (usage.requestUsageEntries ?? []).map((entry) => ({
      cachedInputTokens: entry.inputTokensDetails.cached_tokens ?? 0,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      reasoningOutputTokens: entry.outputTokensDetails.reasoning_tokens ?? 0,
      totalTokens: entry.totalTokens,
    })),
    requests: usage.requests,
    totalTokens: usage.totalTokens,
  };
}

function sumDetailEntries(details: Array<Record<string, number>>, key: string): number {
  return details.reduce((total, entry) => total + (entry[key] ?? 0), 0);
}

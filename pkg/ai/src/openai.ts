import { type Agent, type AgentInputItem, OpenAIProvider, Runner, type RunStreamEvent } from '@openai/agents';
import type { ChatRequestUsage, ChatRunUsage } from '@pkg/schema';

import type { AiContext } from './context.js';

export type AiAgentTextStream = AsyncIterable<string | Uint8Array>;

// The subset of StreamedRunResult that toTextDeltas consumes. Node's ReadableStream
// is async-iterable at runtime, so the runner narrows toStream() to this shape.
type RawEventStreamResult = {
  toStream: () => AsyncIterable<RunStreamEvent>;
};

type DetailEntries = Record<string, number> | Array<Record<string, number>>;

type RequestUsageLike = {
  inputTokens: number;
  inputTokensDetails: Record<string, number>;
  outputTokens: number;
  outputTokensDetails: Record<string, number>;
  totalTokens: number;
};

type RequestUsagePayload = {
  inputTokens: number;
  inputTokensDetails?: DetailEntries | undefined;
  outputTokens: number;
  outputTokensDetails?: DetailEntries | undefined;
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
  onRequestUsage?: (usage: ChatRequestUsage) => void;
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
    async run({ agent, context, input, maxTurns, onRequestUsage, signal }) {
      const result = await runner.run(agent, input, {
        context,
        maxTurns,
        signal,
        stream: true,
      });

      return {
        textStream: toTextDeltas(result as unknown as RawEventStreamResult, onRequestUsage),
        usage: async () => {
          await result.completed;
          return toChatRunUsage(result.state.usage);
        },
      };
    },
  };
}

// Consume the raw event stream once (do not also read toTextStream, which derives
// from the same source) so per-call usage can be observed as the run progresses.
export async function* toTextDeltas(
  result: RawEventStreamResult,
  onRequestUsage?: (usage: ChatRequestUsage) => void,
): AsyncIterable<string> {
  for await (const event of result.toStream()) {
    if (event.type !== 'raw_model_stream_event') {
      continue;
    }

    if (event.data.type === 'output_text_delta') {
      yield event.data.delta;
    } else if (event.data.type === 'response_done' && onRequestUsage) {
      try {
        onRequestUsage(toChatRequestUsage(event.data.response.usage));
      } catch {
        // A misbehaving usage observer must not tear down the text stream.
      }
    }
  }
}

export function toChatRequestUsage(usage: RequestUsagePayload): ChatRequestUsage {
  return {
    cachedInputTokens: readDetailEntries(usage.inputTokensDetails, 'cached_tokens'),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningOutputTokens: readDetailEntries(usage.outputTokensDetails, 'reasoning_tokens'),
    totalTokens: usage.totalTokens,
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

// Per-call usage details are a single record, but the SDK types allow an array
// (aggregate usage). Read a key from either shape.
function readDetailEntries(details: DetailEntries | undefined, key: string): number {
  if (!details) {
    return 0;
  }

  if (Array.isArray(details)) {
    return sumDetailEntries(details, key);
  }

  return details[key] ?? 0;
}

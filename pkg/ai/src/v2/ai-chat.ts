import type { AiReasoningEffort, ChatRequestUsage } from '@pkg/schema';
import {
  convertToModelMessages,
  type LanguageModel,
  type LanguageModelUsage,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';

import { createAiSdkTools, type V2AiToolName } from './ai-sdk-tools.js';
import type { AiV2Context } from './context.js';
import { createSystemPrompt } from './prompts.js';

const MAX_STEPS = 10;

export type ValidateAiUiMessagesResult = { messages: UIMessage[]; ok: true } | { error: string; ok: false };

// Deep structural check of the posted UI messages. The `AiChatInput` schema deliberately keeps only
// the transport caps and stays permissive on part internals; this is where malformed parts (e.g. an
// assistant part with an unknown `type`) are rejected — so the route can turn them into a 400 rather
// than letting `convertToModelMessages` throw a 500 mid-request.
export async function validateAiUiMessages(messages: unknown): Promise<ValidateAiUiMessagesResult> {
  const result = await safeValidateUIMessages({ messages });
  return result.success ? { messages: result.data, ok: true } : { error: result.error.message, ok: false };
}

export type StreamAiChatOptions = {
  abortSignal?: AbortSignal;
  ctx: AiV2Context;
  messages: UIMessage[];
  model: LanguageModel;
  reasoningEffort: AiReasoningEffort;
};

// AI SDK v6 chat turn: authorized tool set → `streamText` with a bounded multi-step tool loop →
// a UI-message-stream `Response`. Owns assistant orchestration only; the caller (the Fastify
// route) bridges the returned web `Response` onto the Node reply.
export async function streamAiChat({
  abortSignal,
  ctx,
  messages,
  model,
  reasoningEffort,
}: StreamAiChatOptions): Promise<Response> {
  const tools = createAiSdkTools(ctx);
  const system = createSystemPrompt(Object.keys(tools) as V2AiToolName[]);
  const modelMessages = await convertToModelMessages(messages, { tools });

  const result = streamText({
    ...(abortSignal ? { abortSignal } : {}),
    messages: modelMessages,
    model,
    providerOptions: { openai: { reasoningEffort } },
    stopWhen: stepCountIs(MAX_STEPS),
    system,
    tools,
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) =>
      part.type === 'finish' ? { usage: toChatRequestUsage(part.totalUsage) } : undefined,
    onError: (error) => (error instanceof Error ? error.message : 'AI chat failed'),
  });
}

// Projects the AI SDK usage shape onto our existing `ChatRequestUsage` so the client's usage
// footer + context gauge read the same fields regardless of which backend produced them.
function toChatRequestUsage(usage: LanguageModelUsage): ChatRequestUsage {
  return {
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningOutputTokens: usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

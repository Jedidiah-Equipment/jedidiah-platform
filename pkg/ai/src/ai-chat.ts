import type { AiReasoningEffort } from '@pkg/schema';
import {
  convertToModelMessages,
  type LanguageModel,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';

import { createAiSdkTools } from './ai-sdk-tools.js';
import type { AiContext } from './context.js';
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
  ctx: AiContext;
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
  const system = createSystemPrompt();
  const tools = createAiSdkTools(ctx);
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
    onError: (error) => (error instanceof Error ? error.message : 'AI chat failed'),
  });
}

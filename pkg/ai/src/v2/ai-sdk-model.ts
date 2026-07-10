import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

// The one place the AI SDK OpenAI provider is constructed. Uses the Responses API so per-request
// usage reports cached-input and reasoning tokens (the same details the legacy runner surfaced),
// and so `reasoningEffort` provider options apply. The API package owns the key/model config and
// calls this to build the model.
export function createOpenAiChatModel({ apiKey, model }: { apiKey: string; model: string }): LanguageModel {
  return createOpenAI({ apiKey }).responses(model);
}

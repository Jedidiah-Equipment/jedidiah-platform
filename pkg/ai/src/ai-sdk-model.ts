import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

// The one place the AI SDK OpenAI provider is constructed. The Responses API reports cached-input
// and reasoning tokens and supports the `reasoningEffort` option. The API package owns key/model
// configuration and calls this to build the model.
export function createOpenAiChatModel({ apiKey, model }: { apiKey: string; model: string }): LanguageModel {
  return createOpenAI({ apiKey }).responses(model);
}

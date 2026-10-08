import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel, TranscriptionModel } from 'ai';

// The one place the AI SDK OpenAI provider is constructed. The Responses API reports cached-input
// and reasoning tokens and supports the `reasoningEffort` option. The API package owns key/model
// configuration and calls this to build the model.
export function createOpenAiChatModel({ apiKey, model }: { apiKey: string; model: string }): LanguageModel {
  return createOpenAI({ apiKey }).responses(model);
}

export function createOpenAiTranscriptionModel({
  apiKey,
  model,
  fetch,
}: {
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
}): TranscriptionModel {
  return createOpenAI({ apiKey, fetch: withTranscriptionKeywords(fetch) }).transcription(model);
}

/** Carries a transcription call's keywords to the provider's fetch, URI-encoded JSON; never sent. */
export const TRANSCRIPTION_KEYWORDS_HEADER = 'x-transcription-keywords';

// TODO(ai-sdk): drop this once the OpenAI provider forwards `keywords`; 4.0.89 does not.
/** Moves the keywords header into the form as `keywords[]`, for gpt-transcribe only: older models refuse the field. */
function withTranscriptionKeywords(fetch: typeof globalThis.fetch = globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    const encoded = headers.get(TRANSCRIPTION_KEYWORDS_HEADER);
    if (encoded === null) return fetch(input, init);
    headers.delete(TRANSCRIPTION_KEYWORDS_HEADER);
    const body = init?.body;
    if (body instanceof FormData && String(body.get('model')).startsWith('gpt-transcribe'))
      for (const keyword of JSON.parse(decodeURIComponent(encoded)) as string[]) body.append('keywords[]', keyword);
    return fetch(input, { ...init, headers });
  };
}

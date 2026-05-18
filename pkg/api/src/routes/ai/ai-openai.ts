import OpenAI from 'openai';

import { getApiConfig } from '@/env.js';

export type AiOpenAIClient = OpenAI;

export function createOpenAIClient(): AiOpenAIClient {
  const config = getApiConfig();

  return new OpenAI({
    apiKey: config.OPENAI_API_KEY,
  });
}

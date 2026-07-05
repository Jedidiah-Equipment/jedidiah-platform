import { getEncoding } from 'js-tiktoken';

import type { RegisteredAiTool } from './tool-registry.js';
import type { AuthorizedAiTools } from './tools.js';

// gpt-5.5's exact tokenizer is not published; o200k_base (the gpt-4o family
// encoding) is the closest public match, so this is a labelled estimate.
const encoding = getEncoding('o200k_base');

function countTokens(text: string): number {
  return encoding.encode(text).length;
}

// Approximates the input token footprint the model receives: the system prompt
// plus each authorized tool's name, description, and parameter JSON schema.
export function estimateContextTokens(systemPrompt: string, tools: AuthorizedAiTools): number {
  const toolText = Object.values(tools)
    .filter((tool): tool is RegisteredAiTool => Boolean(tool))
    .map((tool) => `${tool.name}\n${tool.description}\n${JSON.stringify(tool.jsonSchema)}`)
    .join('\n');

  return countTokens(`${systemPrompt}\n${toolText}`);
}

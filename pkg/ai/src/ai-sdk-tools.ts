import { tool as createAiSdkTool, type Tool, type ToolSet } from 'ai';
import type { z } from 'zod';

import type { AiContext } from './context.js';
import type { AiToolName } from './tool-registry.js';
import { type AuthorizedAiTools, dispatchToolCall, getAuthorizedTools } from './tools.js';

export type CreateAiSdkToolsOptions = {
  // Restrict the exposed set to these tool names (still intersected with the caller's
  // authorization). Omit to expose every authorized tool.
  include?: readonly AiToolName[];
};

// Per-request factory that maps the registry onto AI SDK `tool()`s. It closes over the
// authenticated `AiContext`, exposes only tools the caller is authorized for (via
// `getAuthorizedTools`), and runs each call through `dispatchToolCall` inside `execute` so the
// shared result projection + 24KB truncation apply. A handler failure is returned to the model as
// an `{ error }` payload rather than thrown, so one bad tool call never aborts the stream.
//
// Lives in @pkg/ai (not the route) so the quote-email port can reuse the same tool wiring.
export function createAiSdkTools(ctx: AiContext, options: CreateAiSdkToolsOptions = {}): ToolSet {
  const authorizedTools = getAuthorizedTools(ctx.access);
  const tools: ToolSet = {};

  for (const name of toolNames(authorizedTools, options.include)) {
    const registeredTool = authorizedTools[name];

    if (!registeredTool) {
      continue;
    }

    tools[name] = createAiSdkTool({
      description: registeredTool.description,
      inputSchema: registeredTool.inputSchema as z.ZodType<unknown>,
      async execute(input) {
        const result = await dispatchToolCall(authorizedTools, name, input, ctx);
        return result.ok ? result.result : { error: result.error };
      },
    }) as Tool;
  }

  return tools;
}

function toolNames(authorizedTools: AuthorizedAiTools, include?: readonly AiToolName[]): AiToolName[] {
  const authorized = Object.keys(authorizedTools) as AiToolName[];
  return include ? authorized.filter((name) => include.includes(name)) : authorized;
}

import { Agent, type AgentInputItem } from '@openai/agents';
import { buildQuoteEmailPrompt } from '@pkg/domain';
import type { QuoteDetail } from '@pkg/schema';

import type { AiAgentRunner } from '../ai-openai.js';
import { createSystemPrompt } from '../ai-prompts.js';
import { createAgentTools, getAuthorizedToolNames, getAuthorizedTools } from '../ai-tools.js';
import type { AiReasoningEffort } from '../chat-stream.js';
import type { AiContext } from '../context.js';

// A getQuote tool call plus the email turn; small ceiling keeps a stray loop from running away.
const MAX_AGENT_TURNS = 4;
const GENERATION_TIMEOUT_MS = 60_000;
const noop = () => {};

/**
 * Generates a customer-ready quote email body through the same tool-enabled agent the chat assistant
 * uses — it looks the Quote up with the authorized AI tools rather than us hand-feeding facts, so the
 * two surfaces share one client, one system prompt, and one base prompt. Non-streaming: the agent's
 * text stream is collected into a single string for the email.
 */
export async function generateQuoteEmailBody({
  aiContext,
  model,
  quote,
  reasoningEffort,
  runner,
}: {
  aiContext: AiContext;
  model: string;
  quote: Pick<QuoteDetail, 'code' | 'id'>;
  reasoningEffort: AiReasoningEffort;
  runner: AiAgentRunner;
}): Promise<string> {
  const authorizedTools = getAuthorizedTools(aiContext.access, { includeWriteTools: false });
  const authorizedToolNames = getAuthorizedToolNames(authorizedTools);

  const agent = new Agent<AiContext>({
    instructions: createSystemPrompt(authorizedToolNames),
    model,
    modelSettings: { reasoning: { effort: reasoningEffort } },
    name: 'JedidiahOps assistant',
    tools: createAgentTools(authorizedTools, noop, noop),
  });

  const input: AgentInputItem[] = [
    {
      content: buildQuoteEmailPrompt({ code: quote.code, quoteId: quote.id }),
      role: 'user',
    },
  ];

  aiContext.log.info({ model, quoteCode: quote.code }, 'drafting quote email body');

  const stream = await runner.run({
    agent,
    context: aiContext,
    input,
    maxTurns: MAX_AGENT_TURNS,
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });

  const decoder = new TextDecoder();
  let body = '';
  for await (const delta of stream) {
    body += typeof delta === 'string' ? delta : decoder.decode(delta, { stream: true });
  }
  body += decoder.decode();

  const trimmed = body.trim();

  if (!trimmed) {
    throw new Error('The assistant returned an empty quote email body.');
  }

  return trimmed;
}

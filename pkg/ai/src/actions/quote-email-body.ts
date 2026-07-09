import type { AgentInputItem } from '@openai/agents';
import { buildQuoteEmailPrompt } from '@pkg/domain';
import type { AiReasoningEffort, QuoteDetail } from '@pkg/schema';
import { createAssistantAgent } from '../agent.js';
import type { AiContext } from '../context.js';
import type { AiAgentRunner } from '../openai.js';
import { getAuthorizedTools } from '../tools.js';

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
  const agent = createAssistantAgent({
    authorizedTools,
    model,
    onToolCall: noop,
    onToolResult: noop,
    reasoningEffort,
  });

  const input: AgentInputItem[] = [
    {
      content: buildQuoteEmailPrompt({ code: quote.code, quoteId: quote.id }),
      role: 'user',
    },
  ];

  aiContext.log.ai.info({ model, quoteCode: quote.code }, 'drafting quote email body');

  const { textStream, usage } = await runner.run({
    agent,
    context: aiContext,
    input,
    maxTurns: MAX_AGENT_TURNS,
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });

  const decoder = new TextDecoder();
  let body = '';
  for await (const delta of textStream) {
    body += typeof delta === 'string' ? delta : decoder.decode(delta, { stream: true });
  }
  body += decoder.decode();

  try {
    aiContext.log.ai.info({ usage: await usage() }, 'drafted quote email body');
  } catch (error) {
    aiContext.log.ai.warn({ error }, 'failed to read quote email usage');
  }

  const trimmed = body.trim();

  if (!trimmed) {
    throw new Error('The assistant returned an empty quote email body.');
  }

  return trimmed;
}

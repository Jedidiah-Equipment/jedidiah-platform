import { Agent, type AgentInputItem } from '@openai/agents';
import type { ChatEvent, ChatStreamInput, ChatStreamMessage } from '@pkg/schema';

import type { AiAgentRunner } from './ai-openai.js';
import { createSystemPrompt } from './ai-prompts.js';
import { createAgentTools, getAuthorizedToolNames, getAuthorizedTools } from './ai-tools.js';
import type { AiContext } from './context.js';

const MAX_AGENT_TURNS = 10;

export type AiReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export type RunChatStreamOptions = {
  ctx: AiContext;
  emit: (event: ChatEvent) => void;
  input: ChatStreamInput;
  model: string;
  reasoningEffort: AiReasoningEffort;
  runner: AiAgentRunner;
  signal: AbortSignal;
};

// Emits exactly one terminal event for runner failures so transports only need to guard duplicate writes.
export async function runChatStream({
  ctx,
  emit,
  input,
  model,
  reasoningEffort,
  runner,
  signal,
}: RunChatStreamOptions): Promise<void> {
  try {
    const authorizedTools = getAuthorizedTools(ctx.access);
    const authorizedToolNames = getAuthorizedToolNames(authorizedTools);
    const agentInput = createAgentInput(input.messages);
    const tools = createAgentTools(authorizedTools, emit, emit);
    const agent = new Agent<AiContext>({
      instructions: createSystemPrompt(authorizedToolNames),
      model,
      modelSettings: {
        reasoning: {
          effort: reasoningEffort,
        },
      },
      name: 'JedidiahOps assistant',
      tools,
    });

    ctx.log.info({ input: agentInput, model, reasoningEffort, toolNames: authorizedToolNames }, 'starting chat');

    const stream = await runner.run({
      agent,
      context: ctx,
      input: agentInput,
      maxTurns: MAX_AGENT_TURNS,
      signal,
    });

    const textDecoder = new TextDecoder();

    for await (const delta of stream) {
      const textDelta = decodeTextDelta(delta, textDecoder);

      ctx.log.trace({ delta: textDelta }, 'content delta');

      if (textDelta) {
        emit({
          type: 'token',
          delta: textDelta,
        });
      }
    }

    const finalTextDelta = textDecoder.decode();

    if (finalTextDelta) {
      emit({
        type: 'token',
        delta: finalTextDelta,
      });
    }

    ctx.log.info('stream done');
    emit({
      type: 'done',
    });
  } catch (error) {
    emit({
      type: 'error',
      message: error instanceof Error ? error.message : 'AI stream failed',
    });
  }
}

function decodeTextDelta(delta: string | Uint8Array, decoder: InstanceType<typeof TextDecoder>): string {
  return typeof delta === 'string' ? delta : decoder.decode(delta, { stream: true });
}

function createAgentInput(messages: ChatStreamMessage[]): AgentInputItem[] {
  return messages.map((message) => {
    if (message.role === 'assistant') {
      return {
        content: [
          {
            text: message.content,
            type: 'output_text',
          },
        ],
        role: 'assistant',
        status: 'completed',
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

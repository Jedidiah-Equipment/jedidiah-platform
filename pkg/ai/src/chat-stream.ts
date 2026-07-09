import type { AgentInputItem } from '@openai/agents';
import type { AiReasoningEffort, ChatEvent, ChatRunUsage, ChatStreamInput, ChatStreamMessage } from '@pkg/schema';
import { createAssistantAgent } from './agent.js';
import type { AiContext } from './context.js';
import type { AiAgentRunner } from './openai.js';
import { getAuthorizedToolNames, getAuthorizedTools } from './tools.js';

const MAX_AGENT_TURNS = 10;

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
    const agent = createAssistantAgent({
      authorizedTools,
      model,
      onToolCall: emit,
      onToolResult: emit,
      reasoningEffort,
    });

    ctx.log.ai.info({ input: agentInput, model, reasoningEffort, toolNames: authorizedToolNames }, 'starting chat');

    const { textStream, usage } = await runner.run({
      agent,
      context: ctx,
      input: agentInput,
      maxTurns: MAX_AGENT_TURNS,
      signal,
    });

    const textDecoder = new TextDecoder();

    for await (const delta of textStream) {
      const textDelta = decodeTextDelta(delta, textDecoder);

      ctx.log.ai.trace({ delta: textDelta }, 'content delta');

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

    const runUsage = await readRunUsage(usage, ctx);
    ctx.log.ai.info({ usage: runUsage }, 'stream done');
    emit({
      type: 'done',
      ...(runUsage ? { usage: runUsage } : {}),
    });
  } catch (error) {
    emit({
      type: 'error',
      message: error instanceof Error ? error.message : 'AI stream failed',
    });
  }
}

async function readRunUsage(usage: () => Promise<ChatRunUsage>, ctx: AiContext): Promise<ChatRunUsage | null> {
  try {
    return await usage();
  } catch (error) {
    ctx.log.ai.warn({ error }, 'failed to read run usage');
    return null;
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

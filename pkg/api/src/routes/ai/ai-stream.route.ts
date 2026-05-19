import type { OutgoingHttpHeaders } from 'node:http';

import { Agent, type AgentInputItem } from '@openai/agents';
import { ChatStreamInput, type ChatStreamMessage } from '@pkg/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { type ApiConfig, getApiConfig } from '@/env.js';
import { log } from '@/logger.js';
import { type AiContext, buildAiContext } from './ai-context.js';
import { type AiAgentRunner, createAiAgentRunner } from './ai-openai.js';
import { createSystemPrompt } from './ai-prompts.js';
import { closeStream, SSE_HEADERS, writeError, writeEvent } from './ai-sse.js';
import { createAgentTools, getAuthorizedToolNames, getAuthorizedTools } from './ai-tools.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const STREAM_TIMEOUT_MS = 60_000;

const config = getApiConfig();
const MAX_AGENT_TURNS = 10;
type AiReasoningEffort = ApiConfig['OPENAI_REASONING_EFFORT'];

export type RegisterAiStreamRouteOptions = {
  buildContext?: (req: FastifyRequest) => Promise<AiContext>;
  createAgentRunner?: () => AiAgentRunner;
  model?: string;
  reasoningEffort?: AiReasoningEffort;
};

export async function registerAiStreamRoute(
  app: FastifyInstance,
  options: RegisterAiStreamRouteOptions = {},
): Promise<void> {
  const createRunner = options.createAgentRunner ?? createAiAgentRunner;
  const model = options.model ?? config.OPENAI_MODEL;
  const reasoningEffort = options.reasoningEffort ?? config.OPENAI_REASONING_EFFORT;
  const createContext = options.buildContext ?? buildAiContext;

  app.post('/ai/chat-stream', async (request, reply) => {
    const ctx = await createContext(request);

    if (!ctx.session) {
      return reply.code(401).send({
        error: 'Unauthorized',
      });
    }

    const parsedInput = ChatStreamInput.safeParse(request.body);

    if (!parsedInput.success) {
      return reply.code(400).send({
        error: 'Invalid chat stream payload',
        issues: z.treeifyError(parsedInput.error),
      });
    }

    return streamChatCompletion({
      ctx,
      createRunner,
      input: parsedInput.data,
      model,
      reasoningEffort,
      reply,
      request,
    });
  });
}

async function streamChatCompletion({
  ctx,
  createRunner,
  input,
  model,
  reasoningEffort,
  reply,
  request,
}: {
  ctx: AiContext;
  createRunner: () => AiAgentRunner;
  input: ChatStreamInput;
  model: string;
  reasoningEffort: AiReasoningEffort;
  reply: FastifyReply;
  request: FastifyRequest;
}): Promise<void> {
  reply.hijack();
  reply.raw.writeHead(200, getStreamHeaders(reply));

  let isWritable = true;
  let terminalEventSent = false;
  const abortController = new AbortController();

  const stopWriting = () => {
    isWritable = false;
  };

  const cleanup = () => {
    clearInterval(heartbeat);
    clearTimeout(timeout);
    request.raw.off('close', handleRequestClose);
    reply.raw.off('close', handleReplyClose);
  };

  const sendTerminalError = (message: string) => {
    if (!isWritable || terminalEventSent) {
      return;
    }

    terminalEventSent = true;
    writeError(reply, message);
  };

  const heartbeat = setInterval(() => {
    if (isWritable) {
      reply.raw.write(': heartbeat\n\n');
    }
  }, HEARTBEAT_INTERVAL_MS);

  const timeout = setTimeout(() => {
    sendTerminalError('AI stream timed out');
    abortUpstream();
    closeStream(reply);
  }, STREAM_TIMEOUT_MS);

  const abortUpstream = () => {
    stopWriting();
    abortController.abort();
    cleanup();
  };

  const handleRequestClose = () => {
    if (request.raw.destroyed) {
      abortUpstream();
    }
  };

  const handleReplyClose = () => {
    if (!reply.raw.writableEnded) {
      abortUpstream();
    }
  };

  request.raw.on('close', handleRequestClose);
  reply.raw.on('close', handleReplyClose);

  try {
    const runner = createRunner();
    const authorizedTools = getAuthorizedTools(ctx.access);
    const authorizedToolNames = getAuthorizedToolNames(authorizedTools);
    const agentInput = createAgentInput(input.messages);

    const tools = createAgentTools(
      authorizedTools,
      (event) => {
        if (isWritable) {
          writeEvent(reply, event);
        }
      },
      (event) => {
        if (isWritable) {
          writeEvent(reply, event);
        }
      },
    );
    const agent = new Agent<AiContext>({
      instructions: createSystemPrompt(authorizedToolNames),
      model,
      modelSettings: {
        reasoning: {
          effort: reasoningEffort,
        },
      },
      name: 'Jedidiah Platform assistant',
      tools,
    });

    log.ai.info({ input: agentInput, model, reasoningEffort, toolNames: authorizedToolNames }, 'starting chat');

    const stream = await runner.run({
      agent,
      context: ctx,
      input: agentInput,
      maxTurns: MAX_AGENT_TURNS,
      signal: abortController.signal,
    });

    for await (const delta of stream) {
      const textDelta = decodeTextDelta(delta);

      log.ai.trace({ delta: textDelta }, 'content delta');

      if (isWritable && textDelta) {
        writeEvent(reply, {
          type: 'token',
          delta: textDelta,
        });
      }
    }

    log.ai.info('stream done');

    if (isWritable && !terminalEventSent) {
      terminalEventSent = true;
      writeEvent(reply, {
        type: 'done',
      });
    }
  } catch (error) {
    sendTerminalError(getErrorMessage(error));
  } finally {
    cleanup();
    closeStream(reply);
  }
}

function getStreamHeaders(reply: FastifyReply): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};

  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) {
      headers[name] = value;
    }
  }

  return {
    ...headers,
    ...SSE_HEADERS,
  };
}

function decodeTextDelta(delta: string | Uint8Array): string {
  return typeof delta === 'string' ? delta : new TextDecoder().decode(delta);
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'AI stream failed';
}

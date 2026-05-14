import type { OutgoingHttpHeaders } from 'node:http';

import { ChatStreamInput, type ChatStreamMessage } from '@pkg/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { z } from 'zod';

import { log } from '@/logger.js';
import { type AiContext, buildAiContext } from './ai-context.js';
import { type AiOpenAIClient, createOpenAIClient, getOpenAIModel } from './ai-openai.js';
import { createSystemPrompt } from './ai-prompts.js';
import { closeStream, SSE_HEADERS, writeError, writeEvent } from './ai-sse.js';
import { type AiToolName, createRunnableTools, getAuthorizedToolNames, getAuthorizedTools } from './ai-tools.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const STREAM_TIMEOUT_MS = 60_000;

export type CreateOpenAIClient = () => Pick<AiOpenAIClient, 'chat'>;

export type RegisterAiStreamRouteOptions = {
  buildContext?: (req: FastifyRequest) => Promise<AiContext>;
  createOpenAIClient?: CreateOpenAIClient;
  model?: string;
};

export async function registerAiStreamRoute(
  app: FastifyInstance,
  options: RegisterAiStreamRouteOptions = {},
): Promise<void> {
  const createClient = options.createOpenAIClient ?? createOpenAIClient;
  const model = options.model ?? getOpenAIModel();
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
      createClient,
      input: parsedInput.data,
      model,
      reply,
      request,
    });
  });
}

async function streamChatCompletion({
  ctx,
  createClient,
  input,
  model,
  reply,
  request,
}: {
  ctx: AiContext;
  createClient: CreateOpenAIClient;
  input: ChatStreamInput;
  model: string;
  reply: FastifyReply;
  request: FastifyRequest;
}): Promise<void> {
  reply.hijack();
  reply.raw.writeHead(200, getStreamHeaders(reply));

  let isWritable = true;
  let terminalEventSent = false;
  let stream: ChatCompletionStream | null = null;

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
    stream?.abort();
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
    const client = createClient();
    const authorizedTools = getAuthorizedTools(ctx.access);
    const authorizedToolNames = getAuthorizedToolNames(authorizedTools);
    const messages = createMessages(input.messages, authorizedToolNames);

    const tools = createRunnableTools(
      authorizedTools,
      ctx,
      // On tool call event, write the event to the stream if it is writable
      (event) => {
        if (isWritable) {
          writeEvent(reply, event);
        }
      },
    );

    log.ai.info({ model, tools, messages }, 'starting chat');

    // runTools handles the full agentic loop: executes tool calls, feeds results back
    // to the model, and continues streaming until the model stops requesting tools.
    stream = client.chat.completions.runTools({
      model,
      messages,
      stream: true,
      tools,
    }) as unknown as ChatCompletionStream;

    stream.on('content.delta', (event) => {
      const { delta } = event as { delta: string };
      log.ai.trace({ delta }, 'content delta');

      // If the stream is writable and there is a delta, write the event to the stream
      if (isWritable && delta) {
        writeEvent(reply, {
          type: 'token',
          delta,
        });
      }
    });

    // final message post delta stream
    stream.on('message', (message) => {
      log.ai.debug({ message }, 'message');
    });

    stream.on('chunk', (chunk) => {
      log.ai.trace({ chunk }, 'chunk');
    });

    stream.on('error', (event) => {
      log.ai.error({ err: event }, 'stream error');
      sendTerminalError(getErrorMessage(event));
    });

    await stream.done();
    log.ai.info('stream done');

    // write the done event to the stream if it is writable and the terminal event has not been sent
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

function createMessages(messages: ChatStreamMessage[], toolNames: readonly AiToolName[]): ChatCompletionMessageParam[] {
  const systemMessages: ChatCompletionMessageParam[] = [{ role: 'system', content: createSystemPrompt(toolNames) }];

  return [
    ...systemMessages,
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'AI stream failed';
}

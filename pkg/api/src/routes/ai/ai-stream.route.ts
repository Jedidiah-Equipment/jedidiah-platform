import type { OutgoingHttpHeaders } from 'node:http';

import {
  type AiAgentRunner,
  type AiContext,
  type AiReasoningEffort,
  createAiAgentRunner,
  runChatStream,
} from '@pkg/ai';
import type { StorageAdapter } from '@pkg/core';
import { ChatStreamInput } from '@pkg/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { type ApiConfig, getApiConfig } from '@/env.js';
import { buildAiContext } from './ai-context.js';
import { closeStream, SSE_HEADERS, writeError, writeEvent } from './ai-sse.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const STREAM_TIMEOUT_MS = 60_000;

export type RegisterAiStreamRouteOptions = {
  buildContext?: (req: FastifyRequest) => Promise<AiContext>;
  createAgentRunner?: () => AiAgentRunner;
  model?: string;
  reasoningEffort?: AiReasoningEffort;
  storage?: StorageAdapter;
};

export async function registerAiStreamRoute(
  app: FastifyInstance,
  options: RegisterAiStreamRouteOptions = {},
): Promise<void> {
  const config = getAiStreamRouteConfig(options);
  const createRunner =
    options.createAgentRunner ?? (() => createAiAgentRunner({ apiKey: getApiConfig().OPENAI_API_KEY }));
  const model = config.model;
  const reasoningEffort = config.reasoningEffort;
  const createContext = options.buildContext ?? ((req) => buildAiContext(req, { storage: getAiStorage(options) }));

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

function getAiStorage(options: RegisterAiStreamRouteOptions): StorageAdapter {
  if (!options.storage) {
    throw new Error('AI stream route requires document storage.');
  }

  return options.storage;
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
    await runChatStream({
      ctx,
      emit: (event) => {
        if (!isWritable) {
          return;
        }

        if (event.type === 'done' || event.type === 'error') {
          if (terminalEventSent) {
            return;
          }

          terminalEventSent = true;
        }

        writeEvent(reply, event);
      },
      input,
      model,
      reasoningEffort,
      runner,
      signal: abortController.signal,
    });
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

function getAiStreamRouteConfig(options: RegisterAiStreamRouteOptions): {
  model: string;
  reasoningEffort: ApiConfig['OPENAI_REASONING_EFFORT'];
} {
  if (options.model && options.reasoningEffort) {
    return {
      model: options.model,
      reasoningEffort: options.reasoningEffort,
    };
  }

  const config = getApiConfig();

  return {
    model: options.model ?? config.OPENAI_MODEL,
    reasoningEffort: options.reasoningEffort ?? config.OPENAI_REASONING_EFFORT,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'AI stream failed';
}

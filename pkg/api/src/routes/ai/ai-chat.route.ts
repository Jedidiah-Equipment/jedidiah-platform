import type { OutgoingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';

import { type AiChatModel, type AiContext, createOpenAiChatModel, streamAiChat, validateAiUiMessages } from '@pkg/ai';
import type { StorageAdapter } from '@pkg/core';
import { AiChatInput, type AiReasoningEffort } from '@pkg/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { type ApiConfig, getApiConfig } from '@/env.js';
import { buildAiContext } from './ai-context.js';

// Aborts a stalled provider stream and closes the response, matching the legacy chat-stream route's
// budget so a hung upstream cannot tie up the connection (and OpenAI cost) indefinitely.
const STREAM_TIMEOUT_MS = 60_000;

export type RegisterAiChatRouteOptions = {
  buildContext?: (req: FastifyRequest) => Promise<AiContext>;
  createModel?: () => AiChatModel;
  reasoningEffort?: AiReasoningEffort;
  storage?: StorageAdapter;
};

// AI SDK v6 chat route. Sits beside `POST /ai/chat-stream`, sharing its gates — session auth (401),
// the `assistantEnabled` check (403), and the 40-message/64KB input caps (400) — but speaks the AI
// SDK UI-message-stream protocol instead of the bespoke SSE `ChatEvent` protocol. The assistant
// run itself lives in `@pkg/ai`; this route owns transport: auth, input parsing, and bridging the
// web `Response` from `toUIMessageStreamResponse()` onto the raw Node reply.
export async function registerAiChatRoute(
  app: FastifyInstance,
  options: RegisterAiChatRouteOptions = {},
): Promise<void> {
  const reasoningEffort = options.reasoningEffort ?? getApiConfig().OPENAI_REASONING_EFFORT;
  const createModel = options.createModel ?? (() => getDefaultModel(getApiConfig()));
  const createContext = options.buildContext ?? ((req) => buildAiContext(req, { storage: getAiStorage(options) }));

  app.post('/ai/chat', async (request, reply) => {
    const ctx = await createContext(request);

    if (!ctx.session) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (ctx.session.user.assistantEnabled !== true) {
      return reply.code(403).send({ error: 'Assistant is not enabled for this account' });
    }

    const parsedInput = AiChatInput.safeParse(request.body);

    if (!parsedInput.success) {
      return reply.code(400).send({
        error: 'Invalid chat payload',
        issues: z.treeifyError(parsedInput.error),
      });
    }

    // Deep UI-message validation the shallow schema delegates: reject malformed parts here with a
    // 400 instead of letting `convertToModelMessages` throw a 500 once inside `streamAiChat`.
    const validated = await validateAiUiMessages(parsedInput.data.messages);

    if (!validated.ok) {
      return reply.code(400).send({ error: 'Invalid chat payload', issues: validated.error });
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS);
    const handleRequestClose = () => {
      if (request.raw.destroyed) {
        abortController.abort();
      }
    };
    request.raw.on('close', handleRequestClose);

    try {
      const response = await streamAiChat({
        abortSignal: abortController.signal,
        ctx,
        messages: validated.messages,
        model: createModel(),
        reasoningEffort,
      });

      await sendWebResponse(reply, response);
    } finally {
      clearTimeout(timeout);
      request.raw.off('close', handleRequestClose);
    }
  });
}

// Writes a web `Response` (headers + streamed body) onto the raw Node reply, preserving the
// headers Fastify already set for this reply (e.g. CORS from `@fastify/cors`).
async function sendWebResponse(reply: FastifyReply, response: Response): Promise<void> {
  reply.hijack();

  const headers: OutgoingHttpHeaders = {};

  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) {
      headers[name] = value;
    }
  }

  response.headers.forEach((value, name) => {
    headers[name] = value;
  });

  reply.raw.writeHead(response.status, headers);

  if (!response.body) {
    reply.raw.end();
    return;
  }

  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  reply.raw.on('close', () => {
    if (!reply.raw.writableEnded) {
      body.destroy();
    }
  });

  try {
    for await (const chunk of body) {
      reply.raw.write(chunk);
    }
  } catch {
    // The response is already committed (200 + streamed body), so a teardown mid-stream — client
    // disconnect or the stream-timeout abort — can only be handled by closing the reply, not by
    // surfacing an HTTP error.
  } finally {
    reply.raw.end();
  }
}

function getDefaultModel(config: ApiConfig): AiChatModel {
  return createOpenAiChatModel({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL });
}

function getAiStorage(options: RegisterAiChatRouteOptions): StorageAdapter {
  if (!options.storage) {
    throw new Error('AI chat route requires document storage.');
  }

  return options.storage;
}

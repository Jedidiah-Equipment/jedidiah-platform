import type { OutgoingHttpHeaders } from "node:http";

import { ChatStreamInput, type ChatStreamMessage } from "@pkg/schema";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ChatCompletionStream } from "openai/lib/ChatCompletionStream";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";

import { createLogger } from "@/logger.js";
import { type AiContext, buildAiContext } from "./ai-context.js";
import { type AiOpenAIClient, createOpenAIClient, getOpenAIModel } from "./ai-openai.js";
import { SYSTEM_PROMPT } from "./ai-prompts.js";
import { closeStream, SSE_HEADERS, writeError, writeEvent } from "./ai-sse.js";
import { createRunnableTools } from "./ai-tools.js";

const log = createLogger("ai");

const HEARTBEAT_INTERVAL_MS = 15_000;
const STREAM_TIMEOUT_MS = 60_000;

export type CreateOpenAIClient = () => Pick<AiOpenAIClient, "chat">;

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

  app.post("/ai/chat-stream", async (request, reply) => {
    const ctx = await createContext(request);

    if (!ctx.session) {
      return reply.code(401).send({
        error: "Unauthorized",
      });
    }

    const parsedInput = ChatStreamInput.safeParse(request.body);

    if (!parsedInput.success) {
      return reply.code(400).send({
        error: "Invalid chat stream payload",
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
    request.raw.off("close", handleRequestClose);
    reply.raw.off("close", handleReplyClose);
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
      reply.raw.write(": heartbeat\n\n");
    }
  }, HEARTBEAT_INTERVAL_MS);

  const timeout = setTimeout(() => {
    sendTerminalError("AI stream timed out");
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

  request.raw.on("close", handleRequestClose);
  reply.raw.on("close", handleReplyClose);

  try {
    const client = createClient();

    // runTools handles the full agentic loop: executes tool calls, feeds results back
    // to the model, and continues streaming until the model stops requesting tools.
    stream = client.chat.completions.runTools({
      model,
      messages: createMessages(input.messages),
      stream: true,
      tools: createRunnableTools(ctx, (event) => {
        if (isWritable) {
          writeEvent(reply, event);
        }
      }),
    }) as unknown as ChatCompletionStream;

    stream.on("content.delta", (event) => {
      const { delta } = event as { delta: string };
      log.trace({ delta }, "content delta");

      if (isWritable && delta) {
        writeEvent(reply, {
          type: "token",
          delta,
        });
      }
    });

    const streamWithChunkEvents = stream as ChatCompletionStream & {
      on(event: "chunk", listener: (chunk: unknown) => void): ChatCompletionStream;
    };

    streamWithChunkEvents.on("chunk", (chunk) => {
      log.trace({ chunk }, "chunk");
    });

    stream.on("message", (message) => {
      log.debug({ message }, "message");
    });

    stream.on("error", (event) => {
      log.error({ err: event }, "stream error");
      sendTerminalError(getErrorMessage(event));
    });

    await stream.done();
    log.info("stream done");

    if (isWritable && !terminalEventSent) {
      terminalEventSent = true;
      writeEvent(reply, {
        type: "done",
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

function createMessages(messages: ChatStreamMessage[]): ChatCompletionMessageParam[] {
  const systemMessages: ChatCompletionMessageParam[] = SYSTEM_PROMPT
    ? [{ role: "system", content: SYSTEM_PROMPT }]
    : [];

  return [
    ...systemMessages,
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "AI stream failed";
}

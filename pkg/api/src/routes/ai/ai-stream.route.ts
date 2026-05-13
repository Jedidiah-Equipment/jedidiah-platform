import { ChatStreamInput, type ChatStreamMessage } from "@pkg/schema";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  ChatCompletionStream,
  FunctionToolCallArgumentsDoneEvent,
} from "openai/lib/ChatCompletionStream";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";

import { type AiContext, buildAiContext } from "./ai-context.js";
import { type AiOpenAIClient, createOpenAIClient, getOpenAIModel } from "./ai-openai.js";
import { SYSTEM_PROMPT } from "./ai-prompts.js";
import { closeStream, SSE_HEADERS, writeError, writeEvent } from "./ai-sse.js";
import { dispatchToolCall, openAiTools } from "./ai-tools.js";

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
  reply.raw.writeHead(200, SSE_HEADERS);

  let isWritable = true;
  let terminalEventSent = false;
  let stream: ChatCompletionStream | null = null;
  const toolCalls: Promise<void>[] = [];

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
    stream?.abort();
    closeStream(reply);
  }, STREAM_TIMEOUT_MS);

  const abortUpstream = () => {
    stopWriting();
    stream?.abort();
    cleanup();
  };

  const handleRequestClose = () => {
    if (request.raw.aborted) {
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
    stream = client.chat.completions.stream({
      model,
      messages: createMessages(input.messages),
      stream: true,
      tools: openAiTools,
      tool_choice: "auto",
    });

    stream.on("content.delta", (event) => {
      const { delta } = event;

      if (isWritable && delta) {
        writeEvent(reply, {
          type: "token",
          delta,
        });
      }
    });

    stream.on("tool_calls.function.arguments.done", (event) => {
      const toolCall = event;
      const toolCallResult = Promise.resolve()
        .then(() => dispatchToolCall(toolCall.name, parseToolArguments(toolCall), ctx))
        .catch((error) => ({
          type: "tool_result" as const,
          name: toolCall.name,
          ok: false,
          summary: getErrorMessage(error),
        }))
        .then((result) => {
          if (isWritable) {
            writeEvent(reply, result);
          }
        });

      toolCalls.push(toolCallResult);
    });

    stream.on("error", (event) => {
      sendTerminalError(getErrorMessage(event));
    });

    await stream.done();
    await Promise.all(toolCalls);

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

function createMessages(messages: ChatStreamMessage[]): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

function parseToolArguments(toolCall: FunctionToolCallArgumentsDoneEvent): unknown {
  if (toolCall.parsed_arguments !== undefined) {
    return toolCall.parsed_arguments;
  }

  if (!toolCall.arguments) {
    return {};
  }

  return JSON.parse(toolCall.arguments);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "AI stream failed";
}

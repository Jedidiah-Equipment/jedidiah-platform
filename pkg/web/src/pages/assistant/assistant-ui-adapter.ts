import type {
  ChatModelAdapter,
  ChatModelRunResult,
  ThreadAssistantMessagePart,
  ThreadMessage,
} from '@assistant-ui/react';
import type { ChatStreamMessage } from '@pkg/schema';

import { streamChatEvents } from './sse-client.js';

type ToolCallState = {
  args: JsonObject;
  argsText: string;
  id: string;
  name: string;
  result?: unknown;
};

type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
type JsonObject = { readonly [key: string]: JsonValue };

export const jedidiahChatAdapter: ChatModelAdapter = {
  async *run({ abortSignal, messages }): AsyncGenerator<ChatModelRunResult> {
    const backendMessages = toBackendMessages(messages);
    const toolCalls: Record<string, ToolCallState> = {};
    let textContent = '';

    const buildContent = (): ThreadAssistantMessagePart[] => {
      const content: ThreadAssistantMessagePart[] = [];

      for (const toolCall of Object.values(toolCalls)) {
        content.push({
          args: toolCall.args,
          argsText: toolCall.argsText,
          result: toolCall.result,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          type: 'tool-call',
        });
      }

      if (textContent.length > 0) {
        content.push({
          text: textContent,
          type: 'text',
        });
      }

      return content;
    };

    for await (const event of streamChatEvents({ messages: backendMessages, signal: abortSignal })) {
      if (event.type === 'token') {
        textContent += event.delta;
        yield { content: buildContent() };
      } else if (event.type === 'tool_call') {
        toolCalls[event.id] = {
          args: toToolArgs(event.args),
          argsText: formatToolArgs(event.args),
          id: event.id,
          name: event.name,
        };
        yield { content: buildContent() };
      } else if (event.type === 'tool_result') {
        const toolCall = toolCalls[event.id];

        if (toolCall) {
          toolCall.result = event.result;
          yield { content: buildContent() };
        }
      } else if (event.type === 'error') {
        throw new Error(event.message);
      } else if (event.type === 'done') {
        yield {
          content: buildContent(),
          ...(event.usage ? { metadata: { custom: { runUsage: event.usage } } } : {}),
          status: {
            reason: 'stop',
            type: 'complete',
          },
        };
      }
    }
  },
};

function toBackendMessages(messages: readonly ThreadMessage[]): ChatStreamMessage[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      content: getTextContent(message),
      role: message.role,
    }))
    .filter((message) => message.content.length > 0);
}

function getTextContent(message: ThreadMessage): string {
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function toToolArgs(value: unknown): JsonObject {
  const jsonValue = toJsonValue(value);

  if (isJsonObject(jsonValue)) {
    return jsonValue;
  }

  return {};
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]));
  }

  return null;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatToolArgs(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

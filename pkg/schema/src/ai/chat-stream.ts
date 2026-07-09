import { z } from 'zod';

import { CHAT_MAX_MESSAGES, CHAT_MAX_PAYLOAD_BYTES, getUtf8ByteLength } from './chat-input-limits.js';

const CHAT_STREAM_MAX_MESSAGE_CHARS = 4_000;

export type ChatEvent =
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; result: unknown; size?: ChatToolResultSizeInfo }
  | { type: 'usage'; request: number; usage: ChatRequestUsage; contextWindow: number | null }
  | { type: 'done'; usage?: ChatRunUsage }
  | { type: 'error'; message: string };

export type ChatRequestUsage = {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type ChatRunUsage = ChatRequestUsage & {
  requestUsage: ChatRequestUsage[];
  requests: number;
};

export type ChatToolResultSizeInfo = {
  maxSerializedBytes: number;
  removedThumbnailFieldsByFallback: number;
  serializedBytes: number;
  truncated: boolean;
};

export type ChatStreamMessage = z.infer<typeof ChatStreamMessage>;
export const ChatStreamMessage = z.object({
  role: z.enum(['assistant', 'user']),
  content: z.string().max(CHAT_STREAM_MAX_MESSAGE_CHARS),
});

export type ChatStreamInput = z.infer<typeof ChatStreamInput>;
export const ChatStreamInput = z
  .object({
    messages: z.array(ChatStreamMessage).max(CHAT_MAX_MESSAGES),
  })
  .superRefine((input, ctx) => {
    const payloadBytes = getUtf8ByteLength(JSON.stringify(input));

    if (payloadBytes > CHAT_MAX_PAYLOAD_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: 'Chat stream payload must be 64KB or less',
        path: ['messages'],
      });
    }
  });

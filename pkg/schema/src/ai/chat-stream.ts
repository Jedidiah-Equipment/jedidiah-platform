import { z } from 'zod';

const CHAT_STREAM_MAX_MESSAGES = 40;
const CHAT_STREAM_MAX_MESSAGE_CHARS = 4_000;
const CHAT_STREAM_MAX_PAYLOAD_BYTES = 64 * 1024;

export type ChatEvent =
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; result: unknown; size?: ChatToolResultSizeInfo }
  | { type: 'done' }
  | { type: 'error'; message: string };

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
    messages: z.array(ChatStreamMessage).max(CHAT_STREAM_MAX_MESSAGES),
  })
  .superRefine((input, ctx) => {
    const payloadBytes = getUtf8ByteLength(JSON.stringify(input));

    if (payloadBytes > CHAT_STREAM_MAX_PAYLOAD_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: 'Chat stream payload must be 64KB or less',
        path: ['messages'],
      });
    }
  });

function getUtf8ByteLength(value: string): number {
  let bytes = 0;

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;

    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }

  return bytes;
}

import { z } from 'zod';

const CHAT_STREAM_MAX_MESSAGES = 40;
const CHAT_STREAM_MAX_MESSAGE_CHARS = 4_000;
const CHAT_STREAM_MAX_PAYLOAD_BYTES = 64 * 1024;

export type ChatEvent =
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string };

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
  return new TextEncoder().encode(value).length;
}

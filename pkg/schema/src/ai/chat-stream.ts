import { z } from "zod";

const CHAT_STREAM_MAX_MESSAGES = 40;
const CHAT_STREAM_MAX_MESSAGE_CHARS = 4_000;
const CHAT_STREAM_MAX_PAYLOAD_BYTES = 64 * 1024;

export type ChatEvent =
  | { type: "token"; delta: string }
  | { type: "tool_call"; name: string; args: unknown }
  | {
      type: "tool_result";
      name: string;
      ok: boolean;
      result?: unknown;
      summary: string;
    }
  | { type: "done" }
  | { type: "error"; message: string };

export type ChatStreamMessage = z.infer<typeof ChatStreamMessage>;
export const ChatStreamMessage = z.object({
  role: z.enum(["assistant", "user"]),
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
        code: "custom",
        message: "Chat stream payload must be 64KB or less",
        path: ["messages"],
      });
    }
  });

function getUtf8ByteLength(value: string): number {
  let length = 0;

  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);

    if (charCode < 0x80) {
      length += 1;
    } else if (charCode < 0x800) {
      length += 2;
    } else if (charCode >= 0xd800 && charCode <= 0xdbff) {
      length += 4;
      index += 1;
    } else {
      length += 3;
    }
  }

  return length;
}

import { z } from 'zod';

import { CHAT_MAX_MESSAGES, CHAT_MAX_PAYLOAD_BYTES, getUtf8ByteLength } from './chat-input-limits.js';

// The AI SDK UI-message envelope posted to `/ai/chat`. Validation is intentionally permissive
// on message/part internals — `convertToModelMessages` on the server performs the exhaustive
// part-shape check, and passthrough keeps part payloads (text, tool state, output) intact for it.
// This schema owns only the route's message-count and total UTF-8 payload caps.
export type AiChatUiMessage = z.infer<typeof AiChatUiMessage>;
export const AiChatUiMessage = z.looseObject({
  id: z.string().optional(),
  role: z.enum(['system', 'user', 'assistant']),
  parts: z.array(z.looseObject({ type: z.string() })),
});

export type AiChatInput = z.infer<typeof AiChatInput>;
export const AiChatInput = z
  .looseObject({
    messages: z.array(AiChatUiMessage).max(CHAT_MAX_MESSAGES),
  })
  .superRefine((input, ctx) => {
    if (getUtf8ByteLength(JSON.stringify(input)) > CHAT_MAX_PAYLOAD_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: 'Chat payload must be 64KB or less',
        path: ['messages'],
      });
    }
  });

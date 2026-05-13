import type { AssistantEvent } from "@pkg/schema";
import type { FastifyReply } from "fastify";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export function writeEvent(reply: FastifyReply, event: AssistantEvent): void {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function writeError(reply: FastifyReply, message: string): void {
  writeEvent(reply, {
    type: "error",
    message,
  });
}

export function closeStream(reply: FastifyReply): void {
  if (!reply.raw.writableEnded) {
    reply.raw.end();
  }
}

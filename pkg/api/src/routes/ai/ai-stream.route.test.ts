import type { Server } from "node:http";
import http from "node:http";

import Fastify from "fastify";
import { describe, expect, test, vi } from "vitest";

import type { AiContext } from "@/routes/ai/ai-context.js";
import { type CreateOpenAIClient, registerAiStreamRoute } from "@/routes/ai/ai-stream.route.js";
import { mockSession } from "@/test/test-utils.js";

function createAiContext(session: AiContext["session"] = mockSession()): AiContext {
  return {
    access: null,
    db: {} as AiContext["db"],
    session,
  };
}

function createClient(stream: StubCompletionStream): ReturnType<CreateOpenAIClient> {
  return {
    chat: {
      completions: {
        stream: vi.fn(() => stream),
      },
    },
  } as unknown as ReturnType<CreateOpenAIClient>;
}

function readSseDataLines(body: string): string[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length));
}

class StubCompletionStream {
  readonly abort = vi.fn(() => {
    this.resolveDone();
  });

  readonly listeners = new Map<string, Array<(payload: unknown) => void>>();

  private resolveDone: () => void = () => undefined;

  constructor(private readonly run: (stream: StubCompletionStream) => Promise<void> | void) {}

  on(event: string, listener: (payload: unknown) => void): StubCompletionStream {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  async done(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.resolveDone = resolve;
      queueMicrotask(async () => {
        await this.run(this);
        resolve();
      });
    });
  }

  emit(event: string, payload: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }
}

describe("POST /ai/chat-stream", () => {
  test("returns 401 without constructing the OpenAI client when there is no session", async () => {
    const app = Fastify();
    const createOpenAIClient = vi.fn(() =>
      createClient(new StubCompletionStream(() => undefined)),
    ) as CreateOpenAIClient;
    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext(null),
      createOpenAIClient,
      model: "test-model",
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/chat-stream",
      payload: {
        messages: [{ role: "user", content: "Show me loaders" }],
      },
    });

    expect(response.statusCode).toBe(401);
    expect(createOpenAIClient).not.toHaveBeenCalled();
  });

  test("streams token and done SSE frames in order for an authenticated request", async () => {
    const app = Fastify();
    const stream = new StubCompletionStream((stub) => {
      stub.emit("content.delta", { delta: "Com" });
      stub.emit("content.delta", { delta: "pact" });
    });

    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext(),
      createOpenAIClient: () => createClient(stream),
      model: "test-model",
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/chat-stream",
      payload: {
        messages: [{ role: "user", content: "Show me loaders" }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.headers["cache-control"]).toBe("no-cache, no-transform");
    expect(response.headers["x-accel-buffering"]).toBe("no");
    expect(readSseDataLines(response.body)).toEqual([
      JSON.stringify({ type: "token", delta: "Com" }),
      JSON.stringify({ type: "token", delta: "pact" }),
      JSON.stringify({ type: "done" }),
    ]);
  });

  test("returns 400 for oversized authenticated payloads", async () => {
    const app = Fastify();
    const createOpenAIClient = vi.fn(() =>
      createClient(new StubCompletionStream(() => undefined)),
    ) as CreateOpenAIClient;
    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext(),
      createOpenAIClient,
      model: "test-model",
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/chat-stream",
      payload: {
        messages: Array.from({ length: 40 }, () => ({
          role: "user",
          content: "a".repeat(2_000),
        })),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(createOpenAIClient).not.toHaveBeenCalled();
  });

  test("aborts the upstream stream when the client disconnects mid-stream", async () => {
    const app = Fastify();
    const stream = new StubCompletionStream((stub) => {
      stub.emit("content.delta", { delta: "Com" });
      return new Promise(() => undefined);
    });

    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext(),
      createOpenAIClient: () => createClient(stream),
      model: "test-model",
    });

    await app.listen({ port: 0 });

    try {
      const server = app.server as Server;
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      await new Promise<void>((resolve, reject) => {
        const request = http.request(
          {
            hostname: "127.0.0.1",
            method: "POST",
            path: "/ai/chat-stream",
            port,
            headers: {
              "content-type": "application/json",
            },
          },
          (response) => {
            response.once("data", () => {
              response.destroy();
            });
          },
        );

        request.on("error", reject);
        request.end(JSON.stringify({ messages: [{ role: "user", content: "Show me loaders" }] }));

        vi.waitFor(() => expect(stream.abort).toHaveBeenCalled()).then(resolve, reject);
      });
    } finally {
      await app.close();
    }
  });
});

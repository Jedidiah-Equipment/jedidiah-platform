import type { Server } from 'node:http';
import http from 'node:http';

import fastifyCors from '@fastify/cors';
import type { AiAgentRunner, AiContext } from '@pkg/ai';
import Fastify from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { registerAiStreamRoute } from '@/routes/ai/ai-stream.route.js';
import { createSilentLogger, mockSession } from '@/test/test-utils.js';

type AiAgentRunInput = Parameters<AiAgentRunner['run']>[0];

function createAiContext({
  db = {} as AiContext['db'],
  session = mockSession(),
}: {
  db?: AiContext['db'];
  session?: ReturnType<typeof mockSession> | null;
} = {}): AiContext {
  return {
    access: null,
    db,
    deliverQuoteDraftEmail: vi.fn(async () => ({ recipientEmail: 'test@example.com', warnings: [] })),
    log: createSilentLogger(),
    session: session
      ? {
          user: {
            id: session.user.id,
            email: session.user.email,
            assistantEnabled: session.user.assistantEnabled === true,
          },
        }
      : null,
    storage: {} as AiContext['storage'],
  };
}

function createRunner(...streams: StubAgentTextStream[]): AiAgentRunner {
  return {
    run: vi.fn(async (input: AiAgentRunInput) => {
      const nextStream = streams.shift();

      if (!nextStream) {
        throw new Error('No stub agent stream was queued');
      }

      nextStream.setInput(input);
      return nextStream;
    }),
  };
}

function readSseDataLines(body: string): string[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length));
}

class StubAgentTextStream implements AsyncIterable<string | Uint8Array> {
  readonly abort = vi.fn(() => {
    this.resolvePending();
  });

  private input: AiAgentRunInput | null = null;
  private resolvePending: () => void = () => undefined;

  constructor(private readonly run: (input: AiAgentRunInput) => AsyncIterable<string | Uint8Array>) {}

  setInput(input: AiAgentRunInput): void {
    this.input = input;

    if (input.signal.aborted) {
      this.abort();
      return;
    }

    input.signal.addEventListener('abort', this.abort, { once: true });
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string | Uint8Array> {
    if (!this.input) {
      throw new Error('Stub agent stream was consumed before input was set');
    }

    yield* this.run(this.input);
  }

  pending(): AsyncIterable<string | Uint8Array> {
    return {
      [Symbol.asyncIterator]: async function* (this: StubAgentTextStream) {
        await new Promise<void>((resolve) => {
          this.resolvePending = resolve;
        });
      }.bind(this),
    };
  }
}

function textDeltas(...deltas: (string | Uint8Array)[]): AsyncIterable<string | Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of deltas) {
        yield delta;
      }
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /ai/chat-stream', () => {
  test('returns 401 without constructing the agent runner when there is no session', async () => {
    const app = Fastify();
    const createAgentRunner = vi.fn(() => createRunner(new StubAgentTextStream(() => textDeltas())));
    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext({ session: null }),
      createAgentRunner,
      model: 'test-model',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat-stream',
      payload: {
        messages: [{ role: 'user', content: 'Show me loaders' }],
      },
    });

    expect(response.statusCode).toBe(401);
    expect(createAgentRunner).not.toHaveBeenCalled();
  });

  test('returns 403 without constructing the agent runner when the assistant is disabled', async () => {
    const app = Fastify();
    const createAgentRunner = vi.fn(() => createRunner(new StubAgentTextStream(() => textDeltas())));
    const disabledSession = mockSession();
    disabledSession.user.assistantEnabled = false;
    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext({ session: disabledSession }),
      createAgentRunner,
      model: 'test-model',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat-stream',
      payload: {
        messages: [{ role: 'user', content: 'Show me loaders' }],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(createAgentRunner).not.toHaveBeenCalled();
  });

  test('streams token and done SSE frames in order for an authenticated request', async () => {
    const app = Fastify();
    const stream = new StubAgentTextStream(() => textDeltas('Com', 'pact'));

    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext(),
      createAgentRunner: () => createRunner(stream),
      model: 'test-model',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat-stream',
      payload: {
        messages: [{ role: 'user', content: 'Show me loaders' }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache, no-transform');
    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(readSseDataLines(response.body)).toEqual([
      JSON.stringify({ type: 'token', delta: 'Com' }),
      JSON.stringify({ type: 'token', delta: 'pact' }),
      JSON.stringify({ type: 'done' }),
    ]);
  });

  test('preserves CORS headers on streamed responses', async () => {
    const app = Fastify();
    const stream = new StubAgentTextStream(() => textDeltas('Compact'));

    await app.register(fastifyCors, {
      credentials: true,
      origin: ['http://localhost:7001'],
    });
    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext(),
      createAgentRunner: () => createRunner(stream),
      model: 'test-model',
    });

    const response = await app.inject({
      headers: {
        origin: 'http://localhost:7001',
      },
      method: 'POST',
      payload: {
        messages: [{ role: 'user', content: 'Show me loaders' }],
      },
      url: '/ai/chat-stream',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:7001');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('returns 400 for oversized authenticated payloads', async () => {
    const app = Fastify();
    const createAgentRunner = vi.fn(() => createRunner(new StubAgentTextStream(() => textDeltas())));
    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext(),
      createAgentRunner,
      model: 'test-model',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat-stream',
      payload: {
        messages: Array.from({ length: 40 }, () => ({
          role: 'user',
          content: 'a'.repeat(2_000),
        })),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(createAgentRunner).not.toHaveBeenCalled();
  });

  test('writes one timeout error frame and closes a stalled stream', async () => {
    vi.useFakeTimers();
    const app = Fastify();
    let stream: StubAgentTextStream;
    stream = new StubAgentTextStream(() => stream.pending());

    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext(),
      createAgentRunner: () => createRunner(stream),
      model: 'test-model',
    });

    const responsePromise = app.inject({
      method: 'POST',
      url: '/ai/chat-stream',
      payload: {
        messages: [{ role: 'user', content: 'Show me loaders' }],
      },
    });

    await vi.advanceTimersByTimeAsync(60_000);
    const response = await responsePromise;

    expect(response.statusCode).toBe(200);
    expect(readSseDataLines(response.body)).toEqual([
      JSON.stringify({ type: 'error', message: 'AI stream timed out' }),
    ]);
    expect(stream.abort).toHaveBeenCalledOnce();
  });

  test('aborts the upstream stream when the client disconnects mid-stream', async () => {
    const app = Fastify();
    let stream: StubAgentTextStream;
    stream = new StubAgentTextStream(() => {
      return {
        async *[Symbol.asyncIterator](): AsyncIterator<string | Uint8Array> {
          yield 'Com';
          yield* stream.pending();
        },
      };
    });

    await registerAiStreamRoute(app, {
      buildContext: async () => createAiContext(),
      createAgentRunner: () => createRunner(stream),
      model: 'test-model',
    });

    await app.listen({ host: '127.0.0.1', port: 0 });

    try {
      const server = app.server as Server;
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      await new Promise<void>((resolve, reject) => {
        const request = http.request(
          {
            hostname: '127.0.0.1',
            method: 'POST',
            path: '/ai/chat-stream',
            port,
            headers: {
              'content-type': 'application/json',
            },
          },
          (response) => {
            response.once('data', () => {
              response.destroy();
            });
          },
        );

        request.on('error', reject);
        request.end(JSON.stringify({ messages: [{ role: 'user', content: 'Show me loaders' }] }));

        vi.waitFor(() => expect(stream.abort).toHaveBeenCalled()).then(resolve, reject);
      });
    } finally {
      await app.close();
    }
  });
});

import type { Server } from 'node:http';
import http from 'node:http';

import fastifyCors from '@fastify/cors';
import { RunContext, type Tool } from '@openai/agents';
import * as productsCore from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { Product } from '@pkg/schema';
import Fastify from 'fastify';
import { describe, expect, test, vi } from 'vitest';

import type { AiContext } from '@/routes/ai/ai-context.js';
import type { AiAgentRunInput, AiAgentRunner } from '@/routes/ai/ai-openai.js';
import { registerAiStreamRoute } from '@/routes/ai/ai-stream.route.js';
import { mockSession } from '@/test/test-utils.js';

function createAiContext({
  access = null,
  db = {} as AiContext['db'],
  session = mockSession(),
}: {
  access?: AiContext['access'];
  db?: AiContext['db'];
  session?: AiContext['session'];
} = {}): AiContext {
  return {
    access,
    db,
    session,
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

function getFunctionTool(input: AiAgentRunInput, name: string): Extract<Tool<AiContext>, { type: 'function' }> {
  const functionTool = input.agent.tools.find((tool): tool is Extract<Tool<AiContext>, { type: 'function' }> => {
    return tool.type === 'function' && tool.name === name;
  });

  if (!functionTool) {
    throw new Error(`Expected function tool ${name} to be exposed`);
  }

  return functionTool;
}

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

  test('decodes split multi-byte token deltas before writing SSE frames', async () => {
    const app = Fastify();
    const bytes = new TextEncoder().encode('A💛B');
    const stream = new StubAgentTextStream(() => textDeltas(bytes.slice(0, 2), bytes.slice(2, 4), bytes.slice(4)));

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
    expect(readSseDataLines(response.body).map((line) => JSON.parse(line))).toEqual([
      { type: 'token', delta: 'A' },
      { type: 'token', delta: '💛B' },
      { type: 'done' },
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

  test('streams a final assistant answer after a tool call', async () => {
    const app = Fastify();
    const product = Product.parse({
      basePrice: 332_500,
      createdAt: '2026-05-13T10:13:20.631Z',
      currencyCode: 'ZAR' as const,
      description: 'Apex forklift',
      id: '00000000-0000-4000-8000-000000000001',
      buildTimeDays: 14,
      modelCode: 'AF-25',
      name: 'Apex Forklift',
      options: [],
      requiresVinNumber: false,
      thumbnailDataUrl: null,
      updatedAt: '2026-05-13T10:13:20.631Z',
    });
    const listProductsSpy = vi.spyOn(productsCore, 'listProducts').mockResolvedValue({
      items: [product],
      sortBy: 'name',
      sortDirection: 'asc',
      total: 1,
    });

    // The Agents runner owns the model/tool loop; simulate it calling the tool
    // then streaming the follow-up response in one pass.
    const stream = new StubAgentTextStream(async function* (input) {
      const listProductsTool = getFunctionTool(input, 'listProducts');
      await listProductsTool.invoke(new RunContext(input.context), 'null');
      yield 'You have Apex Forklift (AF-25) at ZAR 332,500.00.';
    });

    try {
      await registerAiStreamRoute(app, {
        buildContext: async () =>
          createAiContext({
            access: createUserAccessSummary({
              role: 'product-editor',
              userId: 'test-user-id',
            }),
          }),
        createAgentRunner: () => createRunner(stream),
        model: 'test-model',
      });

      const response = await app.inject({
        method: 'POST',
        payload: {
          messages: [{ role: 'user', content: 'What products do we have?' }],
        },
        url: '/ai/chat-stream',
      });
      const events = readSseDataLines(response.body).map((line) => JSON.parse(line) as unknown);

      expect(response.statusCode).toBe(200);
      expect(events).toHaveLength(4);
      expect(events[0]).toMatchObject({
        args: null,
        name: 'listProducts',
        type: 'tool_call',
      });
      expect(events[0]).toHaveProperty('id', expect.any(String));
      expect(events[1]).toEqual({
        id: (events[0] as { id: string }).id,
        result: {
          items: [
            {
              ...product,
              links: [
                {
                  entity: 'Product',
                  href: '/products/00000000-0000-4000-8000-000000000001/edit',
                  label: 'Apex Forklift',
                },
              ],
            },
          ],
          sortBy: 'name',
          sortDirection: 'asc',
          total: 1,
        },
        type: 'tool_result',
      });
      expect(events.slice(2)).toEqual([
        {
          delta: 'You have Apex Forklift (AF-25) at ZAR 332,500.00.',
          type: 'token',
        },
        {
          type: 'done',
        },
      ]);
    } finally {
      listProductsSpy.mockRestore();
    }
  });

  test('does not expose tools without the required permission', async () => {
    const app = Fastify();
    let exposedToolNames: string[] | null = null;
    let reasoningEffort: unknown = null;
    let systemPrompt: string | null = null;
    const stream = new StubAgentTextStream((input) => {
      exposedToolNames = input.agent.tools.map((tool) => tool.name);
      reasoningEffort = input.agent.modelSettings.reasoning?.effort;
      systemPrompt = typeof input.agent.instructions === 'string' ? input.agent.instructions : null;
      return textDeltas();
    });

    await registerAiStreamRoute(app, {
      buildContext: async () =>
        createAiContext({
          access: {
            departments: [],
            permissions: [],
            role: 'sales',
            userId: 'test-user-id',
          },
        }),
      createAgentRunner: () => createRunner(stream),
      model: 'test-model',
      reasoningEffort: 'minimal',
    });

    const response = await app.inject({
      method: 'POST',
      payload: {
        messages: [{ role: 'user', content: 'What products do we have?' }],
      },
      url: '/ai/chat-stream',
    });

    expect(response.statusCode).toBe(200);
    expect(exposedToolNames).toEqual([]);
    expect(reasoningEffort).toBe('minimal');
    expect(systemPrompt).not.toContain('listProducts');
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

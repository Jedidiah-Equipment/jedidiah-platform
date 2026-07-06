import { RunContext, type Tool } from '@openai/agents';
import * as productsCore from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import type { ChatEvent } from '@pkg/schema';
import { Product } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';
import { runChatStream } from './chat-stream.js';
import type { AiContext } from './context.js';
import type { AiAgentRunInput, AiAgentRunner } from './openai.js';
import { createSilentLogger, mockSession } from './test/test-utils.js';

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
    deliverQuoteDraftEmail: vi.fn(async () => ({ recipientEmail: 'test@example.com', warnings: [] })),
    log: createSilentLogger(),
    session,
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

async function collectChatEvents({
  ctx = createAiContext(),
  reasoningEffort = 'low',
  runner,
}: {
  ctx?: AiContext;
  reasoningEffort?: 'minimal' | 'low';
  runner: AiAgentRunner;
}): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];

  await runChatStream({
    ctx,
    emit: (event) => events.push(event),
    input: {
      messages: [{ role: 'user', content: 'Show me loaders' }],
    },
    model: 'test-model',
    reasoningEffort,
    runner,
    signal: new AbortController().signal,
  });

  return events;
}

class StubAgentTextStream implements AsyncIterable<string | Uint8Array> {
  private input: AiAgentRunInput | null = null;

  constructor(private readonly run: (input: AiAgentRunInput) => AsyncIterable<string | Uint8Array>) {}

  setInput(input: AiAgentRunInput): void {
    this.input = input;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string | Uint8Array> {
    if (!this.input) {
      throw new Error('Stub agent stream was consumed before input was set');
    }

    yield* this.run(this.input);
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

describe('runChatStream', () => {
  test('emits token and done events in order', async () => {
    const stream = new StubAgentTextStream(() => textDeltas('Com', 'pact'));

    await expect(collectChatEvents({ runner: createRunner(stream) })).resolves.toEqual([
      { type: 'token', delta: 'Com' },
      { type: 'token', delta: 'pact' },
      { type: 'done' },
    ]);
  });

  test('decodes split multi-byte token deltas', async () => {
    const bytes = new TextEncoder().encode('A💛B');
    const stream = new StubAgentTextStream(() => textDeltas(bytes.slice(0, 2), bytes.slice(2, 4), bytes.slice(4)));

    await expect(collectChatEvents({ runner: createRunner(stream) })).resolves.toEqual([
      { type: 'token', delta: 'A' },
      { type: 'token', delta: '💛B' },
      { type: 'done' },
    ]);
  });

  test('emits tool call and result events before the final assistant answer', async () => {
    const product = Product.parse({
      basePrice: 332_500,
      buildTimeDays: 14,
      createdAt: '2026-05-13T10:13:20.631Z',
      currencyCode: 'ZAR',
      description: 'Apex forklift',
      id: '00000000-0000-4000-8000-000000000001',
      modelCode: 'AF-25',
      name: 'Apex Forklift',
      options: [],
      range: { id: '00000000-0000-4000-8000-000000000301', name: 'Forklifts' },
      rangeId: '00000000-0000-4000-8000-000000000301',
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
    const stream = new StubAgentTextStream(async function* (input) {
      const listProductsTool = getFunctionTool(input, 'listProducts');
      await listProductsTool.invoke(new RunContext(input.context), 'null');
      yield 'You have Apex Forklift (AF-25) at ZAR 332,500.00.';
    });

    try {
      const events = await collectChatEvents({
        ctx: createAiContext({
          access: createUserAccessSummary({
            role: 'procurement-manager',
            userId: 'test-user-id',
          }),
        }),
        runner: createRunner(stream),
      });

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
    let exposedToolNames: string[] | null = null;
    let reasoningEffort: unknown = null;
    let systemPrompt: string | null = null;
    const stream = new StubAgentTextStream((input) => {
      exposedToolNames = input.agent.tools.map((tool) => tool.name);
      reasoningEffort = input.agent.modelSettings.reasoning?.effort;
      systemPrompt = typeof input.agent.instructions === 'string' ? input.agent.instructions : null;
      return textDeltas();
    });

    const events = await collectChatEvents({
      ctx: createAiContext({
        access: {
          permissions: [],
          role: 'sales',
          userId: 'test-user-id',
        },
      }),
      reasoningEffort: 'minimal',
      runner: createRunner(stream),
    });

    expect(events).toEqual([{ type: 'done' }]);
    expect(exposedToolNames).toEqual([]);
    expect(reasoningEffort).toBe('minimal');
    expect(systemPrompt).not.toContain('listProducts');
  });

  test('exposes quote write tools but not standalone Customer create for sales users', async () => {
    let exposedToolNames: string[] | null = null;
    let systemPrompt: string | null = null;
    const stream = new StubAgentTextStream((input) => {
      exposedToolNames = input.agent.tools.map((tool) => tool.name);
      systemPrompt = typeof input.agent.instructions === 'string' ? input.agent.instructions : null;
      return textDeltas();
    });

    await collectChatEvents({
      ctx: createAiContext({
        access: createUserAccessSummary({
          role: 'sales',
          userId: 'test-user-id',
        }),
      }),
      runner: createRunner(stream),
    });

    expect(exposedToolNames).toEqual([
      'listQuotes',
      'getQuote',
      'createQuote',
      'sendDraftQuoteEmail',
      'listQuoteCustomers',
      'listQuoteProducts',
      'listQuoteSalespeople',
    ]);
    expect(systemPrompt).toContain('Write tools mutate records immediately');
    expect(systemPrompt).toContain('createQuote');
    expect(systemPrompt).not.toContain('createCustomer');
  });

  test('emits an error event when the runner fails', async () => {
    const runner: AiAgentRunner = {
      run: vi.fn(async () => {
        throw new Error('runner failed');
      }),
    };

    await expect(collectChatEvents({ runner })).resolves.toEqual([{ type: 'error', message: 'runner failed' }]);
  });
});

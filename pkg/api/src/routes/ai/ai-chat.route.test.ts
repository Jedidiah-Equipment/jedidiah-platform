import type { LanguageModelV3FinishReason, LanguageModelV3StreamPart, LanguageModelV3Usage } from '@ai-sdk/provider';
import fastifyCors from '@fastify/cors';
import type { AiContext } from '@pkg/ai';
import { createUserAccessSummary } from '@pkg/domain';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { registerAiChatRoute } from '@/routes/ai/ai-chat.route.js';
import { createSilentLogger, mockSession } from '@/test/test-utils.js';

// The tools' core reads are stubbed so the route test stays DB-free; the route still exercises the
// real tool factory, authorization, and core-to-tool response mapping around it.
const PRODUCT_ID = '00000000-0000-4000-8000-000000000001';
const PRODUCT = {
  assemblies: [],
  basePrice: 1_000,
  brochureEnabled: false,
  buildTimeDays: 14,
  category: null,
  createdAt: '2026-07-10T08:00:00.000Z',
  currencyCode: 'ZAR' as const,
  description: 'Compact articulated loader',
  id: PRODUCT_ID,
  images: {
    banner: null,
    primary: null,
    secondary1: null,
    secondary2: null,
    technicalDrawing: null,
  },
  keyFeatures: [],
  landerEnabled: false,
  modelCode: 'CL-1',
  name: 'Compact Loader',
  nameHighlight: null,
  productBays: [],
  range: { id: '00000000-0000-4000-8000-000000000002', name: 'Loaders' },
  rangeId: '00000000-0000-4000-8000-000000000002',
  requiresVinNumber: false,
  technicalDetails: [],
  thumbnailDataUrl: null,
  updatedAt: '2026-07-10T09:00:00.000Z',
  variant: null,
  variantId: null,
};

const listProductsMock = vi.fn(async () => ({
  items: [PRODUCT],
  sortBy: 'name' as const,
  sortDirection: 'asc' as const,
  total: 1,
}));
const getProductMock = vi.fn(async () => PRODUCT);

vi.mock('@pkg/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pkg/core')>();
  return {
    ...actual,
    getProduct: () => getProductMock(),
    listProducts: () => listProductsMock(),
  };
});

function createChatContext(session: ReturnType<typeof mockSession> | null = mockSession()): AiContext {
  return {
    access: session ? createUserAccessSummary({ role: 'admin', userId: session.user.id }) : null,
    brochureRenderer: vi.fn(),
    db: {} as AiContext['db'],
    log: createSilentLogger(),
    quoteDocumentRenderer: vi.fn(),
    sendEmail: vi.fn(),
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

const STEP_USAGE: LanguageModelV3Usage = {
  inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 6, text: 6, reasoning: 0 },
};

function finishPart(unified: LanguageModelV3FinishReason['unified']): LanguageModelV3StreamPart {
  return { type: 'finish', finishReason: { unified, raw: unified }, usage: STEP_USAGE };
}

function streamResult(parts: LanguageModelV3StreamPart[]) {
  return { stream: convertArrayToReadableStream(parts) };
}

// Step 1 asks for the tool; step 2 answers with text. `stepCountIs` drives the loop between them.
// Driven by an explicit call counter rather than a doStream array: MockLanguageModelV3 records the
// call before indexing, so an array is effectively 1-based and would skip the first step.
function createTwoStepModel(): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      call += 1;
      return call === 1
        ? streamResult([
            { type: 'stream-start', warnings: [] },
            { type: 'tool-call', toolCallId: 'call-1', toolName: 'findProducts', input: JSON.stringify({}) },
            finishPart('tool-calls'),
          ])
        : streamResult([
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'You have 1 Product' },
            { type: 'text-delta', id: 't1', delta: ': Compact Loader.' },
            { type: 'text-end', id: 't1' },
            finishPart('stop'),
          ]);
    },
  });
}

function createFindThenGetModel(): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      call += 1;

      if (call === 1) {
        return streamResult([
          { type: 'stream-start', warnings: [] },
          { type: 'tool-call', toolCallId: 'find-1', toolName: 'findProducts', input: JSON.stringify({}) },
          finishPart('tool-calls'),
        ]);
      }

      if (call === 2) {
        return streamResult([
          { type: 'stream-start', warnings: [] },
          {
            type: 'tool-call',
            toolCallId: 'get-1',
            toolName: 'getProduct',
            input: JSON.stringify({ id: PRODUCT_ID }),
          },
          finishPart('tool-calls'),
        ]);
      }

      return streamResult([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'The Compact Loader costs R 1 000.00.' },
        { type: 'text-end', id: 't1' },
        finishPart('stop'),
      ]);
    },
  });
}

function userMessage(text: string) {
  return { id: 'm1', role: 'user' as const, parts: [{ type: 'text' as const, text }] };
}

type UiChunk = { type: string; [key: string]: unknown };

function readUiChunks(body: string): UiChunk[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .filter((data) => data !== '[DONE]')
    .map((data) => JSON.parse(data) as UiChunk);
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /ai/chat', () => {
  test('returns 401 without building the model when there is no session', async () => {
    const app = Fastify();
    const createModel = vi.fn(() => createTwoStepModel());
    await registerAiChatRoute(app, {
      buildContext: async () => createChatContext(null),
      createModel,
      reasoningEffort: 'low',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [userMessage('Show me loaders')] },
    });

    expect(response.statusCode).toBe(401);
    expect(createModel).not.toHaveBeenCalled();
  });

  test('returns 403 without building the model when the assistant is disabled', async () => {
    const app = Fastify();
    const createModel = vi.fn(() => createTwoStepModel());
    const disabledSession = mockSession();
    disabledSession.user.assistantEnabled = false;
    await registerAiChatRoute(app, {
      buildContext: async () => createChatContext(disabledSession),
      createModel,
      reasoningEffort: 'low',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [userMessage('Show me loaders')] },
    });

    expect(response.statusCode).toBe(403);
    expect(createModel).not.toHaveBeenCalled();
  });

  test('returns 400 without building the model for oversized payloads', async () => {
    const app = Fastify();
    const createModel = vi.fn(() => createTwoStepModel());
    await registerAiChatRoute(app, {
      buildContext: async () => createChatContext(),
      createModel,
      reasoningEffort: 'low',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: Array.from({ length: 40 }, (_, index) => ({
          id: `m${index}`,
          role: 'user',
          parts: [{ type: 'text', text: 'a'.repeat(2_000) }],
        })),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(createModel).not.toHaveBeenCalled();
  });

  test('returns 400 without building the model for messages that fail deep UI-message validation', async () => {
    const app = Fastify();
    const createModel = vi.fn(() => createTwoStepModel());
    await registerAiChatRoute(app, {
      buildContext: async () => createChatContext(),
      createModel,
      reasoningEffort: 'low',
    });

    // Passes the shallow `AiChatInput` caps but the part type is not a real UI-message part, so
    // `convertToModelMessages` would otherwise throw a 500 downstream.
    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [{ id: 'm1', role: 'assistant', parts: [{ type: 'not-a-real-part' }] }] },
    });

    expect(response.statusCode).toBe(400);
    expect(createModel).not.toHaveBeenCalled();
  });

  test('aborts and closes the stream when it exceeds the timeout budget', async () => {
    vi.useFakeTimers();
    const app = Fastify();
    // A stream that only completes once streamText aborts it — the route's timeout is the sole path
    // to termination here.
    const model = new MockLanguageModelV3({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 't1' });
            abortSignal?.addEventListener('abort', () => {
              try {
                controller.close();
              } catch {
                // already closed
              }
            });
          },
        }),
      }),
    });
    await registerAiChatRoute(app, {
      buildContext: async () => createChatContext(),
      createModel: () => model,
      reasoningEffort: 'low',
    });

    const responsePromise = app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [userMessage('Show me loaders')] },
    });

    await vi.advanceTimersByTimeAsync(60_000);
    const response = await responsePromise;

    expect(response.statusCode).toBe(200);
  });

  test('streams tool-call, tool-result, and text parts for a multi-step conversation', async () => {
    const app = Fastify();
    await registerAiChatRoute(app, {
      buildContext: async () => createChatContext(),
      createModel: () => createTwoStepModel(),
      reasoningEffort: 'low',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [userMessage('Show me loaders')] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(listProductsMock).toHaveBeenCalledOnce();

    const chunks = readUiChunks(response.body);
    const toolCall = chunks.find((chunk) => chunk.type === 'tool-input-available');
    const toolResult = chunks.find((chunk) => chunk.type === 'tool-output-available');
    const textDeltas = chunks.filter((chunk) => chunk.type === 'text-delta');

    expect(toolCall?.toolName).toBe('findProducts');
    expect(toolResult).toBeDefined();
    expect(toolResult?.output).toEqual([
      expect.objectContaining({ id: '00000000-0000-4000-8000-000000000001', name: 'Compact Loader' }),
    ]);
    expect(textDeltas.map((chunk) => chunk.delta).join('')).toBe('You have 1 Product: Compact Loader.');
  });

  test('supports the lightweight find followed by a full Product read', async () => {
    const app = Fastify();
    await registerAiChatRoute(app, {
      buildContext: async () => createChatContext(),
      createModel: () => createFindThenGetModel(),
      reasoningEffort: 'low',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [userMessage('Tell me about the Compact Loader')] },
    });

    expect(response.statusCode).toBe(200);
    expect(listProductsMock).toHaveBeenCalledOnce();
    expect(getProductMock).toHaveBeenCalledOnce();

    const chunks = readUiChunks(response.body);
    expect(chunks.filter((chunk) => chunk.type === 'tool-input-available').map((chunk) => chunk.toolName)).toEqual([
      'findProducts',
      'getProduct',
    ]);
    expect(chunks.filter((chunk) => chunk.type === 'tool-output-available')).toHaveLength(2);
    expect(
      chunks
        .filter((chunk) => chunk.type === 'text-delta')
        .map((chunk) => chunk.delta)
        .join(''),
    ).toBe('The Compact Loader costs R 1 000.00.');
  });

  test('preserves CORS headers on the streamed response', async () => {
    const app = Fastify();
    await app.register(fastifyCors, { credentials: true, origin: ['http://localhost:7001'] });
    await registerAiChatRoute(app, {
      buildContext: async () => createChatContext(),
      createModel: () => createTwoStepModel(),
      reasoningEffort: 'low',
    });

    const response = await app.inject({
      headers: { origin: 'http://localhost:7001' },
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [userMessage('Show me loaders')] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:7001');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});

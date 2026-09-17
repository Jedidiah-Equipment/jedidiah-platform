import { beforeEach, describe, expect, test, vi } from 'vitest';

const observability = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('expo/fetch', () => ({ fetch: globalThis.fetch }));
vi.mock('@/lib/api-base-url', () => ({ apiBaseUrl: 'https://api.jedidiah.test' }));
vi.mock('@/lib/auth', () => ({ sessionCookieHeader: async () => null }));
vi.mock('@/lib/observability', () => observability);

import { assistantChatFetch, getAssistantChatEndpoint, readableAssistantChatError } from './assistant-chat';

describe('Assistant chat transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('targets the existing AI chat route', () => {
    expect(getAssistantChatEndpoint('https://api.jedidiah.test')).toBe('https://api.jedidiah.test/ai/chat');
  });

  test.each([
    [401, undefined, /sign in/i],
    [403, undefined, /not enabled/i],
    [400, 'Invalid chat payload', /invalid chat payload/i],
    [500, undefined, /HTTP 500/i],
  ] as const)('maps HTTP %s failures to an actionable message', (status, bodyError, expected) => {
    expect(readableAssistantChatError(status, bodyError)).toMatch(expected);
  });

  test('streams with the native session cookie and browser credentials', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('ok', { status: 200 });
    });

    await assistantChatFetch(
      'https://api.jedidiah.test/ai/chat',
      { headers: { Accept: 'text/event-stream' }, method: 'POST' },
      'better-auth.session_token=secret',
      fetchImpl,
    );

    const init = fetchImpl.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(init).toEqual(expect.objectContaining({ credentials: 'include', method: 'POST' }));
    expect(headers.get('Accept')).toBe('text/event-stream');
    expect(headers.get('Cookie')).toBe('better-auth.session_token=secret');
  });

  test('throws readable server failures into the chat error state', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ error: 'Assistant is not enabled for this account' }), { status: 403 }),
    );

    await expect(assistantChatFetch('https://api.jedidiah.test/ai/chat', {}, null, fetchImpl)).rejects.toThrow(
      /not enabled/i,
    );
    expect(observability.captureException).not.toHaveBeenCalled();
  });

  test('reports server failures without copying the response body into the exception', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ error: 'private upstream detail' }), { status: 500 }),
    );

    await expect(assistantChatFetch('https://api.jedidiah.test/ai/chat', {}, null, fetchImpl)).rejects.toThrow(
      'private upstream detail',
    );
    expect(observability.captureException).toHaveBeenCalledOnce();
    expect(observability.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Assistant request failed' }),
      { source: 'assistant_response', status: 500 },
    );
  });
});

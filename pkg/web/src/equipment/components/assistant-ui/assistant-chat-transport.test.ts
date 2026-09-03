import { describe, expect, it, vi } from 'vitest';

import { assistantChatFetch, getAiChatEndpoint, readableAssistantChatError } from './assistant-chat-transport.js';

describe('getAiChatEndpoint', () => {
  it('targets the /ai/chat route on the api origin', () => {
    expect(getAiChatEndpoint('https://api.jedidiah.test')).toBe('https://api.jedidiah.test/ai/chat');
  });
});

describe('readableAssistantChatError', () => {
  it('maps 401 to a sign-in prompt', () => {
    expect(readableAssistantChatError(401)).toMatch(/sign in/i);
  });

  it('maps 403 to an assistant-disabled message', () => {
    expect(readableAssistantChatError(403)).toMatch(/not enabled/i);
  });

  it('prefers the server error payload for other statuses', () => {
    expect(readableAssistantChatError(400, 'Invalid chat payload')).toBe('Invalid chat payload');
  });

  it('falls back to a generic message when no body is available', () => {
    expect(readableAssistantChatError(500)).toBe('The assistant request failed (HTTP 500).');
  });
});

describe('assistantChatFetch', () => {
  it('sends the session cookie cross-origin via credentials: include', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));

    await assistantChatFetch('https://api.jedidiah.test/ai/chat', { method: 'POST' }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.jedidiah.test/ai/chat',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );
  });

  it('throws a readable error for a 401 instead of returning the response', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));

    await expect(assistantChatFetch('https://api.jedidiah.test/ai/chat', {}, fetchImpl)).rejects.toThrow(/sign in/i);
  });

  it('surfaces the server error payload for a 403', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'Assistant is not enabled for this account' }), { status: 403 }),
    );

    await expect(assistantChatFetch('https://api.jedidiah.test/ai/chat', {}, fetchImpl)).rejects.toThrow(
      /not enabled/i,
    );
  });
});

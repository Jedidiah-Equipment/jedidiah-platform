import { DefaultChatTransport } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

import { apiBaseUrl } from './api-base-url';
import { sessionCookieHeader } from './auth';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function getAssistantChatEndpoint(baseUrl: string): string {
  return `${baseUrl}/ai/chat`;
}

export function readableAssistantChatError(status: number, bodyError?: string): string {
  if (status === 401) {
    return 'Your session has expired. Please sign in again to use the assistant.';
  }

  if (status === 403) {
    return 'The assistant is not enabled for your account.';
  }

  const trimmed = bodyError?.trim();
  if (trimmed) return trimmed;

  return `The assistant request failed (HTTP ${status}).`;
}

export async function assistantChatFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchImpl: FetchLike = expoFetch as FetchLike,
  cookie: string | null = sessionCookieHeader(),
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (cookie) headers.set('Cookie', cookie);

  const response = await fetchImpl(input, { ...init, credentials: 'include', headers });
  if (!response.ok) {
    throw new Error(readableAssistantChatError(response.status, await readErrorBody(response)));
  }

  return response;
}

export function createAssistantTransport() {
  return new DefaultChatTransport({
    api: getAssistantChatEndpoint(apiBaseUrl),
    fetch: assistantChatFetch,
  });
}

async function readErrorBody(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    if (!text) return undefined;

    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') {
        return parsed.error;
      }
    } catch {
      // Non-JSON API responses remain useful as plain error text.
    }

    return text;
  } catch {
    return undefined;
  }
}

import { DefaultChatTransport } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

import { apiBaseUrl } from '@/lib/api-base-url';
import { sessionCookieHeader } from '@/lib/auth';
import { withSessionCookie } from '@/lib/authed-fetch';
import { addBreadcrumb, captureException } from '@/lib/observability';

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
  init: RequestInit | undefined,
  cookie: string | null,
  fetchImpl: FetchLike = expoFetch as FetchLike,
): Promise<Response> {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchImpl(input, withSessionCookie(init, cookie));
  } catch (error) {
    addBreadcrumb('network', 'assistant request failed', {
      durationMs: Date.now() - startedAt,
      method: init?.method ?? 'POST',
      route: new URL(String(input), apiBaseUrl).pathname,
      status: 0,
    });
    captureException(error, { source: 'assistant_network' });
    throw error;
  }
  addBreadcrumb('network', 'assistant request', {
    durationMs: Date.now() - startedAt,
    method: init?.method ?? 'POST',
    route: new URL(String(input), apiBaseUrl).pathname,
    status: response.status,
  });
  if (!response.ok) {
    if (response.status >= 500) {
      captureException(new Error('Assistant request failed'), {
        source: 'assistant_response',
        status: response.status,
      });
    }
    throw new Error(readableAssistantChatError(response.status, await readErrorBody(response)));
  }

  return response;
}

export function createAssistantTransport() {
  return new DefaultChatTransport({
    api: getAssistantChatEndpoint(apiBaseUrl),
    fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
      assistantChatFetch(input, init, await sessionCookieHeader()),
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
      addBreadcrumb('network', 'assistant error response was not JSON', { status: response.status });
    }

    return text;
  } catch {
    addBreadcrumb('network', 'assistant error response unreadable', { status: response.status });
    return undefined;
  }
}

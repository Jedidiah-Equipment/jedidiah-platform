import { AssistantChatTransport } from '@assistant-ui/react-ai-sdk';

import { getClientConfig } from '@/lib/app-config.js';

// The new AI SDK v6 chat route. The web app and API run on different ports, so requests must carry
// the session cookie cross-origin (`credentials: 'include'`) or the route answers 401.
export function getAiChatEndpoint(apiBaseUrl: string): string {
  return `${apiBaseUrl}/ai/chat`;
}

// Maps a failed `/ai/chat` response onto a message a user can act on. The gates mirror the route:
// 401 without a session, 403 when the assistant is disabled, 400 over the input caps. Anything else
// falls back to the server's `{ error }` payload, then to a generic status line — never an empty
// string, so the thread always shows a real error state instead of hanging.
export function readableAssistantChatError(status: number, bodyError?: string): string {
  if (status === 401) {
    return 'Your session has expired. Please sign in again to use the assistant.';
  }

  if (status === 403) {
    return 'The assistant is not enabled for your account.';
  }

  const trimmed = bodyError?.trim();

  if (trimmed) {
    return trimmed;
  }

  return `The assistant request failed (HTTP ${status}).`;
}

async function readErrorBody(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();

    if (!text) {
      return undefined;
    }

    try {
      const parsed: unknown = JSON.parse(text);

      if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') {
        return parsed.error;
      }
    } catch {
      // Non-JSON body: fall through to the raw text.
    }

    return text;
  } catch {
    return undefined;
  }
}

// Custom fetch used as the transport's escape hatch: it forces `credentials: 'include'` so the
// cross-port session cookie rides along, and converts non-OK responses into a thrown, readable error
// (the AI SDK transport otherwise throws the raw response body). A throw here surfaces in the thread
// as an error state rather than a stalled stream.
export async function assistantChatFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const response = await fetchImpl(input, { ...init, credentials: 'include' });

  if (!response.ok) {
    throw new Error(readableAssistantChatError(response.status, await readErrorBody(response)));
  }

  return response;
}

export function createAssistantChatTransport(apiBaseUrl = getClientConfig().apiBaseUrl) {
  return new AssistantChatTransport({
    api: getAiChatEndpoint(apiBaseUrl),
    credentials: 'include',
    fetch: (input, init) => assistantChatFetch(input, init),
  });
}

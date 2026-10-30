/** The server refused the post with its own sentence; `data` is the body's `data`: its `appCode` and any context. */
export class RouteRefusedError extends Error {
  constructor(
    message: string,
    readonly data: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'RouteRefusedError';
  }
}

/** Posts to an HTTP route and answers the response; throws the server's refusal, or the fallback when it sent none. */
async function postRoute(url: string, init: RequestInit, fallbackMessage: string): Promise<Response> {
  const response = await fetch(url, { ...init, method: 'POST', credentials: 'include' });
  if (response.ok) return response;
  const payload = await response.json().catch(() => null);
  if (typeof payload?.message !== 'string') throw new Error(fallbackMessage);
  throw new RouteRefusedError(
    payload.message,
    typeof payload.data === 'object' && payload.data !== null ? payload.data : {},
  );
}

export const postMultipart = (url: string, body: FormData, fallbackMessage: string) =>
  postRoute(url, { body }, fallbackMessage);

export const postJson = (url: string, body: unknown, fallbackMessage: string) =>
  postRoute(url, { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }, fallbackMessage);

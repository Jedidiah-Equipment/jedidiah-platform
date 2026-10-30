/** The server refused the upload with its own sentence; `data` is the body's `data`: its `appCode` and any context. */
export class MultipartRefusedError extends Error {
  constructor(
    message: string,
    readonly data: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'MultipartRefusedError';
  }
}

/** Posts a multipart body and answers the response; throws the server's refusal, or the fallback when it sent none. */
export async function postMultipart(url: string, body: FormData, fallbackMessage: string): Promise<Response> {
  const response = await fetch(url, { method: 'POST', body, credentials: 'include' });
  if (response.ok) return response;
  const payload = await response.json().catch(() => null);
  if (typeof payload?.message !== 'string') throw new Error(fallbackMessage);
  throw new MultipartRefusedError(
    payload.message,
    typeof payload.data === 'object' && payload.data !== null ? payload.data : {},
  );
}

/** Posts a multipart body and answers the response; throws the server's sentence, or the fallback when it sent none. */
export async function postMultipart(url: string, body: FormData, fallbackMessage: string): Promise<Response> {
  const response = await fetch(url, { method: 'POST', body, credentials: 'include' });
  if (response.ok) return response;
  const payload = await response.json().catch(() => null);
  throw new Error(typeof payload?.message === 'string' ? payload.message : fallbackMessage);
}

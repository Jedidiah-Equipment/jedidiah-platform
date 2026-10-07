/** Posts a multipart body; throws the server's sentence, or the fallback when it sent none. */
export async function postMultipart(url: string, body: FormData, fallbackMessage: string): Promise<void> {
  const response = await fetch(url, { method: 'POST', body, credentials: 'include' });
  if (response.ok) return;
  const payload = await response.json().catch(() => null);
  throw new Error(typeof payload?.message === 'string' ? payload.message : fallbackMessage);
}

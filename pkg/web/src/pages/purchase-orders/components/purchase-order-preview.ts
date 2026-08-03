export async function loadPurchaseOrderPreview(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Purchase Order preview failed with status ${response.status}`);

  return URL.createObjectURL(await response.blob());
}

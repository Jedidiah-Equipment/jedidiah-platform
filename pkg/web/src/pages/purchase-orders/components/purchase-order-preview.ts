export async function ensurePurchaseOrderPreview(url: string, fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Purchase Order preview failed with status ${response.status}`);
}

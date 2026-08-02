export async function runAfterPurchaseOrderAutosaves(
  flushers: Array<() => Promise<boolean>>,
  action: () => Promise<void>,
): Promise<boolean> {
  const results = await Promise.all(flushers.map((flush) => flush()));
  if (results.some((didSave) => !didSave)) return false;
  await action();
  return true;
}

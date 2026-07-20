export function createStableRowKeys<T extends object>(prefix: string): (row: T) => string {
  const keys = new WeakMap<T, string>();
  let nextKey = 0;

  return (row) => {
    const existing = keys.get(row);
    if (existing) return existing;

    const key = `${prefix}-${nextKey}`;
    nextKey += 1;
    keys.set(row, key);
    return key;
  };
}

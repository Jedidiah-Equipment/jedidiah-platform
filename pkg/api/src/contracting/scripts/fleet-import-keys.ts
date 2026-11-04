/** How import rows find their existing counterparts on a rerun: by natural key, case-insensitively. */
export const naturalKey = (value: string) => value.trim().toLowerCase();

/** Category names are unique per kind, case-insensitively, so both take part in the lookup key. */
export const categoryKey = (kind: string, name: string) => `${kind}:${naturalKey(name)}`;

/**
 * BOMs nest but builds never recurse (spec §6), so the catalog has to stay a DAG: a Part that could
 * reach itself through its components describes a build that can never be performed. The walk runs
 * on every BOM save, against the components being proposed rather than the ones already stored.
 */
export function findBomCycle({
  bomByParent,
  componentPartIds,
  parentPartId,
}: {
  /** Every stored BOM, parent Part id to its component Part ids. */
  bomByParent: ReadonlyMap<string, readonly string[]>;
  /** The components being saved onto `parentPartId`, which are not in `bomByParent` yet. */
  componentPartIds: readonly string[];
  parentPartId: string;
}): string[] | null {
  // Pre-existing bad data below the walk must not spin the search forever, so a Part is only ever
  // descended into once. Anything already seen has been proved not to reach the parent.
  const descended = new Set<string>();

  const walk = (partId: string, path: readonly string[]): string[] | null => {
    if (partId === parentPartId) return [...path, partId];
    if (descended.has(partId)) return null;
    descended.add(partId);

    for (const componentPartId of bomByParent.get(partId) ?? []) {
      const cycle = walk(componentPartId, [...path, partId]);
      if (cycle) return cycle;
    }

    return null;
  };

  for (const componentPartId of componentPartIds) {
    const cycle = walk(componentPartId, [parentPartId]);
    if (cycle) return cycle;
  }

  return null;
}

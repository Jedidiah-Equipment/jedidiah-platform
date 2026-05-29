import type { Assembly, OptionalAssembly, UUID } from '@pkg/schema';

/**
 * The minimum a selection must carry to be resolved against the catalog: a reference to a
 * catalog Optional Assembly, or `null` when the reference is gone. Callers pass richer selections
 * (the CFO build carries a snapshot name; the Quote form carries a full snapshot) and get those
 * same objects back, so each layer keeps its own data while sharing one resolution rule.
 */
export type EffectiveBomSelection = {
  productAssemblyId: UUID | null;
};

export type ResolvedOptionalAssembly<TSelection extends EffectiveBomSelection> = {
  assembly: OptionalAssembly;
  selection: TSelection;
};

export type EffectiveBom<TSelection extends EffectiveBomSelection> = {
  overriddenStandardAssemblyIds: Set<UUID>;
  selectedOptionalAssemblies: ResolvedOptionalAssembly<TSelection>[];
  staleSelections: TSelection[];
};

/**
 * Resolves a Quote's selected assemblies against a product's catalog of Assemblies into the
 * Effective Bill of Materials: which Standard Assemblies the selected Optional Assemblies override,
 * which selections resolve to live Optional Assemblies, and which selections are stale.
 *
 * A selection is stale when its reference is absent from the current catalog's Optional Assemblies —
 * the reference is `null`, or it points at an Assembly that no longer exists (or is not Optional).
 * There is no current catalog relationship to trust, so it contributes no override. Staleness is
 * returned as data rather than short-circuiting, so each caller applies its own policy: the CFO build
 * denies Job creation, the Quote form drops the selection from the on-screen total.
 */
export function resolveEffectiveBom<TSelection extends EffectiveBomSelection>({
  catalogAssemblies,
  selectedAssemblies,
}: {
  catalogAssemblies: readonly Assembly[];
  selectedAssemblies: readonly TSelection[];
}): EffectiveBom<TSelection> {
  const optionalAssembliesById = new Map<UUID, OptionalAssembly>();
  for (const assembly of catalogAssemblies) {
    if (assembly.kind === 'optional') {
      optionalAssembliesById.set(assembly.id, assembly);
    }
  }

  const selectedOptionalAssemblies: ResolvedOptionalAssembly<TSelection>[] = [];
  const staleSelections: TSelection[] = [];

  for (const selection of selectedAssemblies) {
    const assembly =
      selection.productAssemblyId === null ? undefined : optionalAssembliesById.get(selection.productAssemblyId);

    if (!assembly) {
      staleSelections.push(selection);
      continue;
    }

    selectedOptionalAssemblies.push({ assembly, selection });
  }

  const overriddenStandardAssemblyIds = new Set<UUID>();
  for (const { assembly } of selectedOptionalAssemblies) {
    for (const standardAssemblyId of assembly.overrideStandardAssemblyIds) {
      overriddenStandardAssemblyIds.add(standardAssemblyId);
    }
  }

  return { overriddenStandardAssemblyIds, selectedOptionalAssemblies, staleSelections };
}

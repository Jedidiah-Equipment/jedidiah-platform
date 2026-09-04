import type { UUID } from '@pkg/schema';
import type { Assembly } from '@pkg/schema/equipment';

import { resolveEffectiveBom } from '../quotes/effective-bom.js';

export type CfoAssemblyKind = 'standard' | 'optional';

export type CfoAssemblyPart = {
  partId: UUID;
  quantity: number;
};

/** One line of a Job's Build Spec: the Optional Assembly it was specced with, under its snapshot name. */
export type BuildSpecAssembly = {
  assemblyName: string;
  productAssemblyId: UUID | null;
};

export type CfoEntry = {
  assemblyName: string;
  kind: CfoAssemblyKind;
  parts: CfoAssemblyPart[];
};

export type BuildCfoResult =
  | {
      ok: true;
      cfo: CfoEntry[];
    }
  | {
      ok: false;
      staleAssemblyNames: string[];
    };

type ResolvedBuildSpecCfo =
  | {
      ok: true;
      optionalCfo: CfoEntry[];
      overriddenStandardAssemblyIds: ReadonlySet<UUID>;
    }
  | {
      ok: false;
      staleAssemblyNames: string[];
    };

/** The work still to fit: Quote selections minus the Optional Assemblies already on the Unit. */
export function selectReworkBuildSpec({
  asBuiltAssemblyIds,
  quoteBuildSpec,
}: {
  asBuiltAssemblyIds: readonly UUID[];
  quoteBuildSpec: readonly BuildSpecAssembly[];
}): BuildSpecAssembly[] {
  const fittedAssemblyIds = new Set(asBuiltAssemblyIds);

  return quoteBuildSpec.filter(
    (assembly) => assembly.productAssemblyId === null || !fittedAssemblyIds.has(assembly.productAssemblyId),
  );
}

/**
 * Projects a Job's Build Spec into a parts-level CFO, against the Product's catalog. The
 * override-and-staleness rule lives in {@link resolveEffectiveBom} — a Build Spec is just another
 * caller of the selection shape it already accepts; this is the Job-creation projection of its
 * result: any stale selection denies Job creation (naming the offending assemblies), otherwise the
 * CFO is the surviving Standard Assemblies plus the specced Optional Assemblies, each carrying Parts.
 */
export function buildCfo({
  buildSpec,
  catalogAssemblies,
}: {
  buildSpec: readonly BuildSpecAssembly[];
  catalogAssemblies: readonly Assembly[];
}): BuildCfoResult {
  const resolved = resolveBuildSpecCfo({ buildSpec, catalogAssemblies });

  if (!resolved.ok) {
    return resolved;
  }

  return {
    ok: true,
    cfo: [
      ...catalogAssemblies
        .filter((assembly) => assembly.kind === 'standard' && !resolved.overriddenStandardAssemblyIds.has(assembly.id))
        .map((assembly): CfoEntry => toCfoEntry(assembly, 'standard')),
      ...resolved.optionalCfo,
    ],
  };
}

/** A Rework CFO contains only the Optional Assemblies this Job is fitting—never the machine's base BOM. */
export function buildReworkCfo({
  buildSpec,
  catalogAssemblies,
}: {
  buildSpec: readonly BuildSpecAssembly[];
  catalogAssemblies: readonly Assembly[];
}): BuildCfoResult {
  const resolved = resolveBuildSpecCfo({ buildSpec, catalogAssemblies });

  if (!resolved.ok) {
    return resolved;
  }

  return { ok: true, cfo: resolved.optionalCfo };
}

function resolveBuildSpecCfo({
  buildSpec,
  catalogAssemblies,
}: {
  buildSpec: readonly BuildSpecAssembly[];
  catalogAssemblies: readonly Assembly[];
}): ResolvedBuildSpecCfo {
  const { overriddenStandardAssemblyIds, selectedOptionalAssemblies, staleSelections } = resolveEffectiveBom({
    catalogAssemblies,
    selectedAssemblies: buildSpec,
  });

  if (staleSelections.length > 0) {
    return { ok: false, staleAssemblyNames: staleSelections.map((selection) => selection.assemblyName) };
  }

  return {
    ok: true,
    optionalCfo: selectedOptionalAssemblies.map(({ assembly, selection }) =>
      toCfoEntry(assembly, 'optional', selection.assemblyName),
    ),
    overriddenStandardAssemblyIds,
  };
}

function toCfoEntry(assembly: Assembly, kind: CfoAssemblyKind, assemblyName = assembly.name): CfoEntry {
  return {
    assemblyName,
    kind,
    parts: assembly.parts.map((part) => ({
      partId: part.partId,
      quantity: part.quantity,
    })),
  };
}

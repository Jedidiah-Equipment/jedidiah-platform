import type { Assembly, UUID } from '@pkg/schema';

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
  const { overriddenStandardAssemblyIds, selectedOptionalAssemblies, staleSelections } = resolveEffectiveBom({
    catalogAssemblies,
    selectedAssemblies: buildSpec,
  });

  if (staleSelections.length > 0) {
    return { ok: false, staleAssemblyNames: staleSelections.map((selection) => selection.assemblyName) };
  }

  return {
    ok: true,
    cfo: [
      ...catalogAssemblies
        .filter((assembly) => assembly.kind === 'standard' && !overriddenStandardAssemblyIds.has(assembly.id))
        .map((assembly): CfoEntry => toCfoEntry(assembly, 'standard')),
      ...selectedOptionalAssemblies.map(
        ({ assembly, selection }): CfoEntry => toCfoEntry(assembly, 'optional', selection.assemblyName),
      ),
    ],
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

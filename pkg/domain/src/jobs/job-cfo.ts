import type { UUID } from '@pkg/schema';

export type CfoAssemblyKind = 'standard' | 'optional';

export type CfoAssemblyPart = {
  partId: UUID;
  quantity: number;
};

export type CfoCatalogAssembly = {
  id: UUID;
  name: string;
  parts: readonly CfoAssemblyPart[];
};

export type CfoAssemblyOverride = {
  optionalAssemblyId: UUID;
  standardAssemblyId: UUID;
};

export type CfoSelectedAssembly = {
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

export function buildCfo({
  optionalAssemblies,
  overrides,
  selectedAssemblies,
  standardAssemblies,
}: {
  standardAssemblies: readonly CfoCatalogAssembly[];
  optionalAssemblies: readonly CfoCatalogAssembly[];
  overrides: readonly CfoAssemblyOverride[];
  selectedAssemblies: readonly CfoSelectedAssembly[];
}): BuildCfoResult {
  const optionalAssembliesById = new Map(optionalAssemblies.map((assembly) => [assembly.id, assembly]));
  const staleAssemblyNames: string[] = [];
  const selectedOptionalAssemblies: { assemblyName: string; catalogAssembly: CfoCatalogAssembly }[] = [];

  for (const selectedAssembly of selectedAssemblies) {
    const optionalAssembly =
      selectedAssembly.productAssemblyId === null
        ? undefined
        : optionalAssembliesById.get(selectedAssembly.productAssemblyId);

    if (!optionalAssembly) {
      staleAssemblyNames.push(selectedAssembly.assemblyName);
      continue;
    }

    selectedOptionalAssemblies.push({
      assemblyName: selectedAssembly.assemblyName,
      catalogAssembly: optionalAssembly,
    });
  }

  if (staleAssemblyNames.length > 0) {
    return { ok: false, staleAssemblyNames };
  }

  const selectedOptionalAssemblyIds = new Set(
    selectedOptionalAssemblies.map((assembly) => assembly.catalogAssembly.id),
  );
  const overriddenStandardAssemblyIds = new Set(
    overrides
      .filter((override) => selectedOptionalAssemblyIds.has(override.optionalAssemblyId))
      .map((override) => override.standardAssemblyId),
  );

  return {
    ok: true,
    cfo: [
      ...standardAssemblies
        .filter((assembly) => !overriddenStandardAssemblyIds.has(assembly.id))
        .map((assembly): CfoEntry => toCfoEntry(assembly, 'standard')),
      ...selectedOptionalAssemblies.map(
        (assembly): CfoEntry => toCfoEntry(assembly.catalogAssembly, 'optional', assembly.assemblyName),
      ),
    ],
  };
}

function toCfoEntry(assembly: CfoCatalogAssembly, kind: CfoAssemblyKind, assemblyName = assembly.name): CfoEntry {
  return {
    assemblyName,
    kind,
    parts: assembly.parts.map((part) => ({
      partId: part.partId,
      quantity: part.quantity,
    })),
  };
}

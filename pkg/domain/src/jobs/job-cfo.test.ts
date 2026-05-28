import { describe, expect, it } from 'vitest';

import { buildCfo, type CfoCatalogAssembly } from './job-cfo.js';

const chassis: CfoCatalogAssembly = assembly('00000000-0000-4000-8000-000000000101', 'Standard Chassis', [
  { partId: '00000000-0000-4000-8000-000000000201', quantity: 2, ignored: 'not copied' },
  { partId: '00000000-0000-4000-8000-000000000202', quantity: 4 },
]);
const axle: CfoCatalogAssembly = assembly('00000000-0000-4000-8000-000000000102', 'Standard Axle', [
  { partId: '00000000-0000-4000-8000-000000000203', quantity: 1 },
]);
const paint: CfoCatalogAssembly = assembly('00000000-0000-4000-8000-000000000103', 'Standard Paint', [
  { partId: '00000000-0000-4000-8000-000000000204', quantity: 3 },
]);
const heavyAxle: CfoCatalogAssembly = assembly('00000000-0000-4000-8000-000000000104', 'Heavy Axle Upgrade', [
  { partId: '00000000-0000-4000-8000-000000000205', quantity: 1 },
]);
const ladderRack: CfoCatalogAssembly = assembly('00000000-0000-4000-8000-000000000105', 'Ladder Rack', [
  { partId: '00000000-0000-4000-8000-000000000206', quantity: 1 },
]);
const selectedAssemblies = [{ assemblyName: 'Heavy Axle Upgrade', productAssemblyId: heavyAxle.id }];
const standardAssemblies = [chassis, axle, paint];
const optionalAssemblies = [heavyAxle, ladderRack];
const overrides = [{ optionalAssemblyId: heavyAxle.id, standardAssemblyId: axle.id }];

describe('buildCfo', () => {
  it('excludes standard assemblies overridden by a selected optional assembly', () => {
    const result = buildCfo({ optionalAssemblies, overrides, selectedAssemblies, standardAssemblies });

    expect(result).toEqual({
      ok: true,
      cfo: [
        {
          assemblyName: 'Standard Chassis',
          kind: 'standard',
          parts: [
            { partId: '00000000-0000-4000-8000-000000000201', quantity: 2 },
            { partId: '00000000-0000-4000-8000-000000000202', quantity: 4 },
          ],
        },
        {
          assemblyName: 'Standard Paint',
          kind: 'standard',
          parts: [{ partId: '00000000-0000-4000-8000-000000000204', quantity: 3 }],
        },
        {
          assemblyName: 'Heavy Axle Upgrade',
          kind: 'optional',
          parts: [{ partId: '00000000-0000-4000-8000-000000000205', quantity: 1 }],
        },
      ],
    });
  });

  it('includes non-overridden standards and selected optionals while ignoring unselected optionals', () => {
    const result = buildCfo({
      optionalAssemblies,
      overrides,
      selectedAssemblies: [
        { assemblyName: 'Heavy Axle Upgrade', productAssemblyId: heavyAxle.id },
        { assemblyName: 'Ladder Rack', productAssemblyId: ladderRack.id },
      ],
      standardAssemblies,
    });

    expect(result).toEqual({
      ok: true,
      cfo: [
        {
          assemblyName: 'Standard Chassis',
          kind: 'standard',
          parts: [
            { partId: '00000000-0000-4000-8000-000000000201', quantity: 2 },
            { partId: '00000000-0000-4000-8000-000000000202', quantity: 4 },
          ],
        },
        {
          assemblyName: 'Standard Paint',
          kind: 'standard',
          parts: [{ partId: '00000000-0000-4000-8000-000000000204', quantity: 3 }],
        },
        {
          assemblyName: 'Heavy Axle Upgrade',
          kind: 'optional',
          parts: [{ partId: '00000000-0000-4000-8000-000000000205', quantity: 1 }],
        },
        {
          assemblyName: 'Ladder Rack',
          kind: 'optional',
          parts: [{ partId: '00000000-0000-4000-8000-000000000206', quantity: 1 }],
        },
      ],
    });
  });

  it('uses quote-selected names for selected optional assemblies instead of live catalog names', () => {
    const result = buildCfo({
      optionalAssemblies: [
        {
          ...heavyAxle,
          name: 'Renamed Heavy Axle Upgrade',
        },
      ],
      overrides,
      selectedAssemblies,
      standardAssemblies,
    });

    expect(result).toMatchObject({
      ok: true,
      cfo: expect.arrayContaining([
        {
          assemblyName: 'Heavy Axle Upgrade',
          kind: 'optional',
          parts: [{ partId: '00000000-0000-4000-8000-000000000205', quantity: 1 }],
        },
      ]),
    });
  });

  it('does not apply override relationships for unselected optionals', () => {
    const result = buildCfo({
      optionalAssemblies,
      overrides,
      selectedAssemblies: [],
      standardAssemblies,
    });

    expect(result).toEqual({
      ok: true,
      cfo: [
        {
          assemblyName: 'Standard Chassis',
          kind: 'standard',
          parts: [
            { partId: '00000000-0000-4000-8000-000000000201', quantity: 2 },
            { partId: '00000000-0000-4000-8000-000000000202', quantity: 4 },
          ],
        },
        {
          assemblyName: 'Standard Axle',
          kind: 'standard',
          parts: [{ partId: '00000000-0000-4000-8000-000000000203', quantity: 1 }],
        },
        {
          assemblyName: 'Standard Paint',
          kind: 'standard',
          parts: [{ partId: '00000000-0000-4000-8000-000000000204', quantity: 3 }],
        },
      ],
    });
  });

  it('returns stale selected assembly names when selected optionals have no live catalog assembly', () => {
    expect(
      buildCfo({
        optionalAssemblies,
        overrides,
        selectedAssemblies: [
          { assemblyName: 'Deleted Winch', productAssemblyId: null },
          { assemblyName: 'Removed Toolbox', productAssemblyId: '00000000-0000-4000-8000-000000000999' },
        ],
        standardAssemblies,
      }),
    ).toEqual({
      ok: false,
      staleAssemblyNames: ['Deleted Winch', 'Removed Toolbox'],
    });
  });

  it('returns an empty CFO for an empty-assembly product', () => {
    expect(
      buildCfo({
        optionalAssemblies: [],
        overrides: [],
        selectedAssemblies: [],
        standardAssemblies: [],
      }),
    ).toEqual({ ok: true, cfo: [] });
  });
});

function assembly(id: string, name: string, parts: readonly Record<string, unknown>[]): CfoCatalogAssembly {
  return {
    id,
    name,
    parts: parts.map((part) => ({
      partId: String(part.partId),
      quantity: Number(part.quantity),
      ...part,
    })),
  };
}

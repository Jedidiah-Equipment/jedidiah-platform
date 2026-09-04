import type { UUID } from '@pkg/schema';
import type { Assembly, AssemblyPart, OptionalAssembly, StandardAssembly } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { buildCfo, buildReworkCfo, selectReworkBuildSpec } from './job-cfo.js';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000001';
const CHASSIS_ID = '00000000-0000-4000-8000-000000000101';
const AXLE_ID = '00000000-0000-4000-8000-000000000102';
const PAINT_ID = '00000000-0000-4000-8000-000000000103';
const HEAVY_AXLE_ID = '00000000-0000-4000-8000-000000000104';
const LADDER_RACK_ID = '00000000-0000-4000-8000-000000000105';

const chassis = standard(CHASSIS_ID, 'Standard Chassis', [
  { partId: '00000000-0000-4000-8000-000000000201', quantity: 2 },
  { partId: '00000000-0000-4000-8000-000000000202', quantity: 4 },
]);
const axle = standard(AXLE_ID, 'Standard Axle', [{ partId: '00000000-0000-4000-8000-000000000203', quantity: 1 }]);
const paint = standard(PAINT_ID, 'Standard Paint', [{ partId: '00000000-0000-4000-8000-000000000204', quantity: 3 }]);
const heavyAxle = optional(
  HEAVY_AXLE_ID,
  'Heavy Axle Upgrade',
  [AXLE_ID],
  [{ partId: '00000000-0000-4000-8000-000000000205', quantity: 1 }],
);
const ladderRack = optional(
  LADDER_RACK_ID,
  'Ladder Rack',
  [],
  [{ partId: '00000000-0000-4000-8000-000000000206', quantity: 1 }],
);
const catalogAssemblies: Assembly[] = [chassis, axle, paint, heavyAxle, ladderRack];

describe('selectReworkBuildSpec', () => {
  it('keeps only Quote assemblies that are not already fitted to the Unit', () => {
    expect(
      selectReworkBuildSpec({
        asBuiltAssemblyIds: [HEAVY_AXLE_ID],
        quoteBuildSpec: [
          { assemblyName: 'Heavy Axle Upgrade', productAssemblyId: HEAVY_AXLE_ID },
          { assemblyName: 'Ladder Rack', productAssemblyId: LADDER_RACK_ID },
        ],
      }),
    ).toEqual([{ assemblyName: 'Ladder Rack', productAssemblyId: LADDER_RACK_ID }]);
  });
});

describe('buildReworkCfo', () => {
  it('covers only the Optional Assemblies being added', () => {
    expect(
      buildReworkCfo({
        buildSpec: [{ assemblyName: 'Heavy Axle Upgrade', productAssemblyId: HEAVY_AXLE_ID }],
        catalogAssemblies,
      }),
    ).toEqual({
      ok: true,
      cfo: [
        {
          assemblyName: 'Heavy Axle Upgrade',
          kind: 'optional',
          parts: [{ partId: '00000000-0000-4000-8000-000000000205', quantity: 1 }],
        },
      ],
    });
  });
});

describe('buildCfo', () => {
  it('emits surviving standards plus selected optionals, excluding overridden standards', () => {
    const result = buildCfo({
      buildSpec: [{ assemblyName: 'Heavy Axle Upgrade', productAssemblyId: HEAVY_AXLE_ID }],
      catalogAssemblies,
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
      ],
    });
  });

  it('uses the Build Spec name rather than the live catalog name for a specced optional', () => {
    const result = buildCfo({
      buildSpec: [{ assemblyName: 'Heavy Axle Upgrade', productAssemblyId: HEAVY_AXLE_ID }],
      catalogAssemblies: [chassis, axle, paint, { ...heavyAxle, name: 'Renamed Heavy Axle Upgrade' }, ladderRack],
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

  it('keeps every standard when nothing is selected', () => {
    const result = buildCfo({ buildSpec: [], catalogAssemblies });

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

  it('denies with the offending names when any selection is stale', () => {
    expect(
      buildCfo({
        buildSpec: [
          { assemblyName: 'Deleted Winch', productAssemblyId: null },
          { assemblyName: 'Removed Toolbox', productAssemblyId: '00000000-0000-4000-8000-000000000999' },
        ],
        catalogAssemblies,
      }),
    ).toEqual({
      ok: false,
      staleAssemblyNames: ['Deleted Winch', 'Removed Toolbox'],
    });
  });

  it('returns an empty CFO for an empty-assembly product', () => {
    expect(buildCfo({ buildSpec: [], catalogAssemblies: [] })).toEqual({ ok: true, cfo: [] });
  });
});

function standard(id: UUID, name: string, parts: AssemblyPart[]): StandardAssembly {
  return { id, isPubliclyVisible: true, kind: 'standard', name, parts, productId: PRODUCT_ID };
}

function optional(
  id: UUID,
  name: string,
  overrideStandardAssemblyIds: UUID[],
  parts: AssemblyPart[],
): OptionalAssembly {
  return {
    id,
    isPubliclyVisible: true,
    kind: 'optional',
    name,
    overrideStandardAssemblyIds,
    parts,
    price: 100,
    productId: PRODUCT_ID,
  };
}

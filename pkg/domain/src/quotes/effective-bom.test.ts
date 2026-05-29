import type { Assembly, OptionalAssembly, StandardAssembly, UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { resolveEffectiveBom } from './effective-bom.js';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000001';
const CHASSIS_ID = '00000000-0000-4000-8000-000000000101';
const AXLE_ID = '00000000-0000-4000-8000-000000000102';
const PAINT_ID = '00000000-0000-4000-8000-000000000103';
const HEAVY_AXLE_ID = '00000000-0000-4000-8000-000000000104';
const LADDER_RACK_ID = '00000000-0000-4000-8000-000000000105';
const REINFORCED_AXLE_ID = '00000000-0000-4000-8000-000000000106';
const ABSENT_ID = '00000000-0000-4000-8000-000000000999';

const chassis = standard(CHASSIS_ID, 'Standard Chassis');
const axle = standard(AXLE_ID, 'Standard Axle');
const paint = standard(PAINT_ID, 'Standard Paint');
// Heavy Axle and Reinforced Axle both override the Standard Axle, exercising overlapping overrides.
const heavyAxle = optional(HEAVY_AXLE_ID, 'Heavy Axle Upgrade', [AXLE_ID]);
const reinforcedAxle = optional(REINFORCED_AXLE_ID, 'Reinforced Axle', [AXLE_ID]);
const ladderRack = optional(LADDER_RACK_ID, 'Ladder Rack', []);
const catalogAssemblies: Assembly[] = [chassis, axle, paint, heavyAxle, reinforcedAxle, ladderRack];

describe('resolveEffectiveBom', () => {
  it('overrides the standard assembly a selected optional replaces', () => {
    const result = resolveEffectiveBom({
      catalogAssemblies,
      selectedAssemblies: [{ productAssemblyId: HEAVY_AXLE_ID }],
    });

    expect([...result.overriddenStandardAssemblyIds]).toEqual([AXLE_ID]);
    expect(result.selectedOptionalAssemblies.map(({ assembly }) => assembly.id)).toEqual([HEAVY_AXLE_ID]);
    expect(result.staleSelections).toEqual([]);
  });

  it('retains every standard assembly when an additive optional has no overrides', () => {
    const result = resolveEffectiveBom({
      catalogAssemblies,
      selectedAssemblies: [{ productAssemblyId: LADDER_RACK_ID }],
    });

    expect(result.overriddenStandardAssemblyIds.size).toBe(0);
    expect(result.selectedOptionalAssemblies.map(({ assembly }) => assembly.id)).toEqual([LADDER_RACK_ID]);
  });

  it('removes a standard assembly once when two selected optionals both override it', () => {
    const result = resolveEffectiveBom({
      catalogAssemblies,
      selectedAssemblies: [{ productAssemblyId: HEAVY_AXLE_ID }, { productAssemblyId: REINFORCED_AXLE_ID }],
    });

    expect([...result.overriddenStandardAssemblyIds]).toEqual([AXLE_ID]);
  });

  it('does not apply override relationships for unselected optionals', () => {
    const result = resolveEffectiveBom({ catalogAssemblies, selectedAssemblies: [] });

    expect(result.overriddenStandardAssemblyIds.size).toBe(0);
    expect(result.selectedOptionalAssemblies).toEqual([]);
    expect(result.staleSelections).toEqual([]);
  });

  it('treats a selection with a null reference as stale', () => {
    const selection = { name: 'Deleted Winch', productAssemblyId: null };
    const result = resolveEffectiveBom({ catalogAssemblies, selectedAssemblies: [selection] });

    expect(result.staleSelections).toEqual([selection]);
    expect(result.selectedOptionalAssemblies).toEqual([]);
  });

  it('treats a selection whose reference is absent from the catalog as stale', () => {
    const selection = { name: 'Removed Toolbox', productAssemblyId: ABSENT_ID };
    const result = resolveEffectiveBom({ catalogAssemblies, selectedAssemblies: [selection] });

    expect(result.staleSelections).toEqual([selection]);
  });

  it('treats a selection pointing at a standard assembly as stale', () => {
    const selection = { productAssemblyId: CHASSIS_ID };
    const result = resolveEffectiveBom({ catalogAssemblies, selectedAssemblies: [selection] });

    expect(result.staleSelections).toEqual([selection]);
    expect(result.overriddenStandardAssemblyIds.size).toBe(0);
  });

  it('resolves live selections and isolates stale ones in one pass', () => {
    const live = { productAssemblyId: HEAVY_AXLE_ID };
    const stale = { productAssemblyId: ABSENT_ID };
    const result = resolveEffectiveBom({ catalogAssemblies, selectedAssemblies: [live, stale] });

    expect(result.selectedOptionalAssemblies.map(({ selection }) => selection)).toEqual([live]);
    expect(result.staleSelections).toEqual([stale]);
    expect([...result.overriddenStandardAssemblyIds]).toEqual([AXLE_ID]);
  });
});

function standard(id: UUID, name: string): StandardAssembly {
  return { id, kind: 'standard', name, parts: [], productId: PRODUCT_ID };
}

function optional(id: UUID, name: string, overrideStandardAssemblyIds: UUID[]): OptionalAssembly {
  return { id, kind: 'optional', name, overrideStandardAssemblyIds, parts: [], price: 100, productId: PRODUCT_ID };
}

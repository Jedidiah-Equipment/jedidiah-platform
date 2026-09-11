import { describe, expect, it } from 'vitest';

import { formatTouchHint, touchedBusinesses } from './path-hints.js';

describe('touchedBusinesses', () => {
  it('reads a contracting folder under any layer package as contracting', () => {
    expect(touchedBusinesses(['pkg/core/src/contracting/fleet/fleet-service.ts'])).toEqual(['contracting']);
    expect(touchedBusinesses(['pkg/db/src/schema/contracting/fleet.ts'])).toEqual(['contracting']);
  });

  it('reads the mobile and web business routes as their business', () => {
    expect(touchedBusinesses(['pkg/mobile/app/(protected)/contracting/fleet/index.tsx'])).toEqual(['contracting']);
    expect(touchedBusinesses(['pkg/web/src/routes/_authed.contracting.fleet.index.tsx'])).toEqual(['contracting']);
    expect(touchedBusinesses(['pkg/web/src/routes/_authed.equipment.jobs.index.tsx'])).toEqual(['equipment']);
  });

  it('reads the lander as equipment', () => {
    expect(touchedBusinesses(['pkg/lander/src/routes/index.tsx'])).toEqual(['equipment']);
  });

  it('reads everything outside a business folder as shared', () => {
    expect(touchedBusinesses(['pkg/web/src/components/app-shell/AuthenticatedRouteShell.tsx'])).toEqual(['shared']);
    expect(touchedBusinesses(['pkg/api/src/trpc/init.ts'])).toEqual(['shared']);
  });

  it('ignores changelogs, docs, markdown and tests', () => {
    expect(
      touchedBusinesses([
        'changelogs/equipment/2026-09-09.json',
        'docs/adr/0018-per-business-changelog.md',
        'pkg/core/AGENTS.md',
        'pkg/core/src/contracting/fleet/fleet-service.test.ts',
      ]),
    ).toEqual([]);
  });

  it('lists every business a commit touches in a fixed order', () => {
    expect(
      touchedBusinesses([
        'pkg/api/src/trpc/init.ts',
        'pkg/web/src/contracting/pages/fleet/FleetPage.tsx',
        'pkg/web/src/equipment/pages/jobs/JobsPage.tsx',
      ]),
    ).toEqual(['equipment', 'contracting', 'shared']);
  });
});

describe('formatTouchHint', () => {
  it('names the touched businesses', () => {
    expect(formatTouchHint(['equipment', 'shared'])).toBe('[touches: equipment, shared]');
  });

  it('says so when a commit touches nothing user-facing', () => {
    expect(formatTouchHint([])).toBe('[touches: none]');
  });
});

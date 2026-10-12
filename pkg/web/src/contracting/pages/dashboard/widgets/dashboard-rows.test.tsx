import { serviceDueStatusColorClassNames } from '@pkg/domain/contracting';
import type { BreakdownSummary, Machine } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/test/router-harness.js';

import { ServiceDueRow } from './ServiceDueWidget.js';
import { OpenBreakdownRow } from './WorkshopWidget.js';

const id = '10000000-0000-4000-8000-000000000000';

describe('OpenBreakdownRow', () => {
  const breakdown = (mechanicName: string | null) =>
    ({
      id,
      subject: {
        kind: 'machine',
        id,
        code: 'KOL220-3',
        categoryName: 'Excavators',
        categoryIcon: 'generic-machine',
        categoryColour: 'yellow',
      },
      jobId: null,
      jobNumber: null,
      urgency: 'code-red',
      status: 'open',
      reportedAt: '2026-10-11T08:00:00.000Z',
      reporterName: 'Sipho',
      mechanicName,
      firstLine: 'Will not start',
    }) as BreakdownSummary;

  it('names the Mechanic, or says the Breakdown is Unassigned', async () => {
    expect(await renderWithRouter(<OpenBreakdownRow breakdown={breakdown(null)} />)).toContain('Unassigned');
    const assigned = await renderWithRouter(<OpenBreakdownRow breakdown={breakdown('Anele')} />);
    expect(assigned).toContain('Anele');
    expect(assigned).not.toContain('Unassigned');
    expect(assigned).toContain(`href="/contracting/workshop/${id}"`);
  });
});

describe('ServiceDueRow', () => {
  it('paints the hours left in the colour of the Machine’s service status', async () => {
    const machine = {
      id,
      code: 'KOL220-2',
      make: 'Kobelco',
      model: '220',
      categoryName: 'Excavators',
      categoryIcon: 'generic-machine',
      categoryColour: 'yellow',
      hoursToService: -5,
      nextServiceDueHours: 55,
      serviceDueStatus: 'overdue',
      busyOnJob: null,
    } as Machine;
    const html = await renderWithRouter(<ServiceDueRow machine={machine} />);
    expect(html).toContain('Overdue by 5.0 h');
    expect(html).toContain(serviceDueStatusColorClassNames.overdue.text);
    expect(html).toContain(`href="/contracting/fleet/${id}/edit"`);
  });
});

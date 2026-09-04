import { statusBadgeColorClassNames } from '@pkg/domain';
import { DateOnlyIso } from '@pkg/schema';
import { ProjectedBayQueue, ProjectedJobSlot } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { buildJobSummary } from '@/equipment/test/job-fixtures.js';
import { renderWithRouter } from '@/test/router-harness.js';

import { SHOP_FLOOR_BAND_HEIGHT_PX } from '../dashboard-widget-layout.js';
import { ShopFloorTodayContent } from './ShopFloorTodayWidget.js';

const today = DateOnlyIso.parse('2026-08-19');
const bayId = '10000000-0000-4000-8000-000000000000';

describe('ShopFloorTodayContent', () => {
  it('shows operator and Bay identity, Product offering, blue progress status, and a capped scroll area', async () => {
    const job = buildJobSummary({ productThumbnailDataUrl: null, quoteKind: 'product' });
    const html = await renderWithRouter(
      <ShopFloorTodayContent
        enabledBays={[buildBay(job.id)]}
        jobsById={new Map([[job.id, job]])}
        offDays={[]}
        today={today}
        workingCalendarsByBayId={new Map()}
      />,
    );

    expect(html.indexOf('Dewald Van Niekerk')).toBeLessThan(html.indexOf('Fabrication Bay 2'));
    expect(html).not.toContain('Aug 19, 2026');
    expect(html.match(/data-slot="avatar" data-size="default"/g)).toHaveLength(2);
    expect(html).toContain('tabler-icon-package');
    expect(html).toContain('In progress');
    expect(html).not.toContain('Working');
    expect(html).toContain(statusBadgeColorClassNames.blue.chip.split(' ')[0]);
    expect(html).toContain(statusBadgeColorClassNames.blue.text.split(' ')[0]);
    expect(html).toContain('data-slot="scroll-area"');
    expect(html).toContain(`height:${SHOP_FLOOR_BAND_HEIGHT_PX}px`);
  });

  it('uses the Custom work offering thumbnail for custom Jobs', async () => {
    const job = buildJobSummary({
      productName: null,
      productThumbnailDataUrl: null,
      quoteKind: 'custom',
      workTitle: 'Trailer repair',
    });
    const html = await renderWithRouter(
      <ShopFloorTodayContent
        enabledBays={[buildBay(job.id)]}
        jobsById={new Map([[job.id, job]])}
        offDays={[]}
        today={today}
        workingCalendarsByBayId={new Map()}
      />,
    );

    expect(html).toContain('tabler-icon-tools');
    expect(html).not.toContain('tabler-icon-package');
  });
});

function buildBay(jobId: string) {
  return ProjectedBayQueue.parse({
    calendarExceptions: [],
    createdAt: '2026-08-01T08:00:00.000Z',
    currentOperator: {
      email: 'dewald@example.com',
      id: 'operator-dewald',
      name: 'Dewald Van Niekerk',
      thumbnailDataUrl: null,
    },
    department: 'fabrication',
    disabledAt: null,
    id: bayId,
    name: 'Fabrication Bay 2',
    nextAvailableDate: '2026-08-20',
    scheduleOrigin: '2026-08-01',
    slots: [
      ProjectedJobSlot.parse({
        bayId,
        createdAt: '2026-08-01T08:00:00.000Z',
        durationDays: 2,
        endDate: '2026-08-20',
        firstWorkDay: '2026-08-18',
        id: '20000000-0000-4000-8000-000000000000',
        jobCode: 1,
        jobId,
        jobUnfinished: true,
        kind: 'work',
        label: null,
        lastWorkDay: '2026-08-19',
        sequence: 1,
        startDate: '2026-08-18',
        state: 'active',
        updatedAt: '2026-08-01T08:00:00.000Z',
      }),
    ],
    updatedAt: '2026-08-01T08:00:00.000Z',
  });
}

import type { BoardListResult, JobDetail } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { isJobNotFoundError, projectJobDetail } from './job-detail-projection';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const BAY_ID = '22222222-2222-4222-8222-222222222222';

describe('projectJobDetail', () => {
  it('projects active Jobs through the existing progress and route model', () => {
    const state = projectJobDetail(jobWithSlots([slot('active')]), board());

    expect(state).toMatchObject({
      jobCode: 'JOB-00042',
      status: 'ready',
      tone: 'in-progress',
      totalCount: 1,
    });
    expect(state.progress).toMatchObject({ currentBayName: 'Assembly Bay 1', status: 'in-progress' });
    expect(state.route).toHaveLength(1);
    expect(state.route[0]).toMatchObject({ bayName: 'Assembly Bay 1', state: 'active' });
  });

  it('keeps completed Jobs ready with their full done route', () => {
    const state = projectJobDetail(jobWithSlots([slot('done')], '2026-08-04'), board());

    expect(state).toMatchObject({ completedOn: '2026-08-04', doneCount: 1, status: 'ready', totalCount: 1 });
    expect(state.progress).toBeNull();
    expect(state.route[0]?.progressPercent).toBe(100);
  });

  it('keeps unscheduled Jobs ready with an empty route and zero progress', () => {
    const state = projectJobDetail(jobWithSlots([]), board());

    expect(state).toMatchObject({ doneCount: 0, status: 'ready', tone: 'muted', totalCount: 0 });
    expect(state.progress).toBeNull();
    expect(state.route).toEqual([]);
  });
});

describe('isJobNotFoundError', () => {
  it('recognises only tRPC NOT_FOUND errors', () => {
    expect(isJobNotFoundError({ data: { code: 'NOT_FOUND' } })).toBe(true);
    expect(isJobNotFoundError({ data: { code: 'FORBIDDEN' } })).toBe(false);
    expect(isJobNotFoundError(new Error('missing'))).toBe(false);
  });
});

function board(): BoardListResult {
  return {
    items: [],
    jobs: [],
    offDays: [],
    today: '2026-08-05',
  } as unknown as BoardListResult;
}

function jobWithSlots(slots: ReturnType<typeof slot>[], completedOn: string | null = null): JobDetail {
  return {
    cancelledAt: null,
    code: 'JOB-00042',
    completedOn,
    customerCompanyName: 'Acme Farms',
    description: null,
    id: JOB_ID,
    productName: 'Square Baler',
    productThumbnailDataUrl: null,
    productUnit: null,
    quoteCode: 'QUO-00042',
    quoteKind: 'product',
    schedule: slots.length
      ? [
          {
            bays: [
              {
                calendarExceptions: [],
                department: 'assembly',
                id: BAY_ID,
                name: 'Assembly Bay 1',
                slots,
              },
            ],
            department: 'assembly',
          },
        ]
      : [],
    workTitle: null,
  } as unknown as JobDetail;
}

function slot(state: 'active' | 'done' | 'scheduled') {
  return {
    bayId: BAY_ID,
    dayBreakdown: { closureDays: 0, overtimeDays: 0, workingDays: 5 },
    endDate: state === 'done' ? '2026-08-05' : '2026-08-10',
    firstWorkDay: state === 'scheduled' ? '2026-08-06' : '2026-08-05',
    id: '33333333-3333-4333-8333-333333333333',
    jobId: JOB_ID,
    lastWorkDay: state === 'done' ? '2026-08-04' : '2026-08-08',
    operator: null,
    startDate: state === 'scheduled' ? '2026-08-06' : '2026-08-01',
    state,
  };
}

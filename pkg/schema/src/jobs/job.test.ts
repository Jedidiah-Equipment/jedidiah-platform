import { describe, expect, it } from 'vitest';

import {
  AddBayCalendarExceptionInput,
  AddBayCalendarExceptionResult,
  AddIdleJobSlotInput,
  AddIdleJobSlotResult,
  Bay,
  BayCalendarException,
  BayCalendarExceptionDirection,
  BayOperatorListResult,
  BoardListInput,
  BoardListResult,
  BoardPreviewInput,
  BoardPreviewResult,
  BookJobSlotInput,
  BookJobSlotResult,
  formatProductSerialNumber,
  Job,
  JobBayAssignOperatorInput,
  JobBayAssignOperatorResult,
  JobBayCreateInput,
  JobBayCreateResult,
  JobBayListInput,
  JobBayListResult,
  JobBayOperatorAssignmentHistoryInput,
  JobBayOperatorAssignmentHistoryResult,
  JobBayRenameInput,
  JobBayRenameResult,
  JobBaySetDisabledInput,
  JobBaySetDisabledResult,
  JobBayUnassignOperatorInput,
  JobBayUnassignOperatorResult,
  JobCode,
  JobColumnFilters,
  JobCreateInput,
  JobCustomerOptionListInput,
  JobDetail,
  JobListFilters,
  JobListInput,
  JobPatchInput,
  JobSortBy,
  MoveJobSlotInput,
  MoveJobSlotResult,
  OffDay,
  ProjectedJobSlot,
  RemoveBayCalendarExceptionInput,
  RemoveBayCalendarExceptionResult,
  RemoveJobSlotInput,
  RemoveJobSlotResult,
  ResizeJobSlotInput,
  ResizeJobSlotResult,
  ToggleOffDayInput,
  ToggleOffDayResult,
} from './job.js';

describe('JobCode', () => {
  it('formats DB integers as branded job codes', () => {
    expect(JobCode.parse(1)).toBe('JOB-00001');
    expect(JobCode.parse(100_000)).toBe('JOB-100000');
  });
});

describe('formatProductSerialNumber', () => {
  it('combines product model code, two-digit year, and padded product sequence', () => {
    expect(formatProductSerialNumber({ prefix: 'SG1836', sequence: 9, year: 26 })).toBe('SG1836260009');
    expect(formatProductSerialNumber({ prefix: 'SG1836', sequence: 10_000, year: 27 })).toBe('SG18362710000');
  });
});

describe('Job', () => {
  it('carries the frozen product serial facts', () => {
    expect(
      Job.parse({
        code: 1,
        createdAt: '2026-06-01T00:00:00.000Z',
        id: '00000000-0000-4000-8000-000000000001',
        invoiceNumber: null,
        productId: '00000000-0000-4000-8000-000000000002',
        productSerialNumber: 'SG1836260009',
        productSerialPrefix: 'SG1836',
        productSerialSequence: 9,
        productSerialYear: 26,
        quoteId: '00000000-0000-4000-8000-000000000003',
        description: null,
        updatedAt: '2026-06-01T00:00:00.000Z',
        vinNumber: null,
      }),
    ).toMatchObject({
      code: 'JOB-00001',
      productSerialNumber: 'SG1836260009',
      productSerialPrefix: 'SG1836',
      productSerialSequence: 9,
      productSerialYear: 26,
      vinNumber: null,
    });
  });

  it('accepts productless custom job facts', () => {
    expect(
      Job.parse({
        code: 2,
        createdAt: '2026-06-01T00:00:00.000Z',
        id: '00000000-0000-4000-8000-000000000001',
        invoiceNumber: null,
        productId: null,
        productSerialNumber: null,
        productSerialPrefix: null,
        productSerialSequence: null,
        productSerialYear: null,
        quoteId: '00000000-0000-4000-8000-000000000003',
        description: null,
        updatedAt: '2026-06-01T00:00:00.000Z',
        vinNumber: null,
      }),
    ).toMatchObject({
      code: 'JOB-00002',
      productId: null,
      productSerialNumber: null,
    });
  });
});

describe('Working Calendar schemas', () => {
  it('accepts off-days and bay exceptions with nullable labels', () => {
    expect(
      OffDay.parse({
        date: '2026-06-16',
        label: 'Youth Day',
      }),
    ).toEqual({
      date: '2026-06-16',
      label: 'Youth Day',
    });
    expect(
      BayCalendarException.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        date: '2026-06-20',
        direction: 'work',
        label: null,
      }),
    ).toEqual({
      bayId: '00000000-0000-4000-8000-000000000001',
      date: '2026-06-20',
      direction: 'work',
      label: null,
    });
  });

  it('normalizes empty write labels to null', () => {
    expect(
      ToggleOffDayInput.parse({
        date: '2026-06-16',
        isOffDay: true,
        label: '  ',
      }),
    ).toEqual({
      date: '2026-06-16',
      isOffDay: true,
      label: null,
    });
    expect(
      AddBayCalendarExceptionInput.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        date: '2026-06-20',
        direction: 'off',
        label: '  Bay maintenance  ',
      }),
    ).toEqual({
      bayId: '00000000-0000-4000-8000-000000000001',
      date: '2026-06-20',
      direction: 'off',
      label: 'Bay maintenance',
    });
  });

  it('accepts mutation results and bay list calendar facts', () => {
    const exception = {
      bayId: '00000000-0000-4000-8000-000000000001',
      date: '2026-06-20',
      direction: 'work',
      label: null,
    } as const;

    expect(AddBayCalendarExceptionResult.parse({ exception })).toEqual({ exception });
    expect(RemoveBayCalendarExceptionResult.parse({ exception })).toEqual({ exception });
    expect(RemoveBayCalendarExceptionResult.parse({ exception: null })).toEqual({ exception: null });
    expect(
      ToggleOffDayResult.parse({
        offDay: {
          date: '2026-06-16',
          label: null,
        },
      }),
    ).toEqual({
      offDay: {
        date: '2026-06-16',
        label: null,
      },
    });
    expect(ToggleOffDayResult.parse({ offDay: null })).toEqual({ offDay: null });
    expect(BoardListInput.parse(undefined)).toEqual({});
    expect(BoardListInput.parse({ from: '2026-06-01' })).toEqual({ from: '2026-06-01' });
    expect(
      BoardListResult.parse({
        items: [
          {
            calendarExceptions: [exception],
            createdAt: '2026-06-01T00:00:00.000Z',
            currentOperator: null,
            department: 'fabrication',
            disabledAt: null,
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Fabrication Bay 1',
            nextAvailableDate: '2026-06-05',
            scheduleOrigin: '2026-06-05',
            slots: [],
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
        jobs: [],
        offDays: [
          {
            date: '2026-06-16',
            label: 'Youth Day',
          },
        ],
        today: '2026-06-05',
      }),
    ).toEqual({
      items: [
        {
          calendarExceptions: [exception],
          createdAt: '2026-06-01T00:00:00.000Z',
          currentOperator: null,
          department: 'fabrication',
          disabledAt: null,
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Fabrication Bay 1',
          nextAvailableDate: '2026-06-05',
          scheduleOrigin: '2026-06-05',
          slots: [],
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      jobs: [],
      offDays: [
        {
          date: '2026-06-16',
          label: 'Youth Day',
        },
      ],
      today: '2026-06-05',
    });
  });

  it('accepts Bay Operator assignment contracts', () => {
    const operator = {
      email: 'operator@example.com',
      id: 'operator-user-id',
      name: 'Operator User',
      thumbnailDataUrl: null,
    };
    const bay = Bay.parse({
      createdAt: '2026-06-01T00:00:00.000Z',
      currentOperator: operator,
      department: 'fabrication',
      disabledAt: null,
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Fabrication Bay 1',
      scheduleOrigin: '2026-06-05',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(
      JobBayAssignOperatorInput.parse({
        bayId: bay.id,
        operatorUserId: operator.id,
      }),
    ).toEqual({
      bayId: bay.id,
      operatorUserId: operator.id,
    });
    expect(JobBayAssignOperatorResult.parse({ bay })).toEqual({ bay });
    expect(JobBayUnassignOperatorInput.parse({ bayId: bay.id })).toEqual({ bayId: bay.id });
    expect(JobBayUnassignOperatorResult.parse({ bay: { ...bay, currentOperator: null } })).toMatchObject({
      bay: {
        currentOperator: null,
        id: bay.id,
      },
    });
    expect(JobBayOperatorAssignmentHistoryInput.parse({ bayId: bay.id })).toEqual({ bayId: bay.id });
    expect(
      JobBayOperatorAssignmentHistoryResult.parse({
        items: [
          {
            assignedAt: '2026-06-05T07:00:00.000Z',
            id: '00000000-0000-4000-8000-000000000101',
            operator,
            unassignedAt: null,
          },
          {
            assignedAt: new Date('2026-06-04T07:00:00.000Z'),
            id: '00000000-0000-4000-8000-000000000100',
            operator,
            unassignedAt: new Date('2026-06-05T07:00:00.000Z'),
          },
        ],
      }),
    ).toEqual({
      items: [
        {
          assignedAt: '2026-06-05T07:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000101',
          operator,
          unassignedAt: null,
        },
        {
          assignedAt: '2026-06-04T07:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000100',
          operator,
          unassignedAt: '2026-06-05T07:00:00.000Z',
        },
      ],
    });
    expect(BayOperatorListResult.parse({ operators: [operator] })).toEqual({ operators: [operator] });
  });

  it('accepts bay exception removal by bay and date', () => {
    expect(
      RemoveBayCalendarExceptionInput.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        date: '2026-06-20',
      }),
    ).toEqual({
      bayId: '00000000-0000-4000-8000-000000000001',
      date: '2026-06-20',
    });
  });

  it('rejects bad shapes and unknown fields', () => {
    expect(() => BayCalendarExceptionDirection.parse('maybe')).toThrow();
    expect(() =>
      BayCalendarException.parse({
        bayId: 'not-a-uuid',
        date: '2026-06-20',
        direction: 'work',
        label: null,
      }),
    ).toThrow();
    expect(() =>
      OffDay.parse({
        date: '2026-06-20T00:00:00.000Z',
        label: null,
      }),
    ).toThrow();
    expect(() =>
      ToggleOffDayInput.parse({
        date: '2026-06-20',
        extra: true,
        isOffDay: false,
      }),
    ).toThrow();
  });
});

describe('Job Bay schemas', () => {
  it('accepts active and disabled Bays', () => {
    expect(
      Bay.parse({
        createdAt: '2026-06-01T00:00:00.000Z',
        department: 'paint',
        disabledAt: '2026-06-02T00:00:00.000Z',
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Paint Bay 1',
        scheduleOrigin: '2026-06-01',
        updatedAt: '2026-06-02T00:00:00.000Z',
      }),
    ).toMatchObject({
      disabledAt: '2026-06-02T00:00:00.000Z',
      name: 'Paint Bay 1',
    });
  });

  it('normalizes bay management names and accepts results', () => {
    const bay = Bay.parse({
      createdAt: '2026-06-01T00:00:00.000Z',
      department: 'assembly',
      disabledAt: null,
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Assembly Bay 1',
      scheduleOrigin: '2026-06-01',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(JobBayCreateInput.parse({ department: 'assembly', name: '  Assembly Bay 1  ' })).toEqual({
      department: 'assembly',
      name: 'Assembly Bay 1',
    });
    expect(JobBayListInput.parse({ filters: { isDisabled: false } })).toEqual({
      filters: { isDisabled: false },
    });
    expect(JobBayRenameInput.parse({ id: bay.id, name: '  Final Assembly  ' })).toEqual({
      id: bay.id,
      name: 'Final Assembly',
    });
    expect(JobBaySetDisabledInput.parse({ disabled: true, id: bay.id })).toEqual({ disabled: true, id: bay.id });
    expect(JobBayListResult.parse({ items: [bay] })).toEqual({ items: [bay] });
    expect(JobBayCreateResult.parse({ bay })).toEqual({ bay });
    expect(JobBayRenameResult.parse({ bay })).toEqual({ bay });
    expect(JobBaySetDisabledResult.parse({ bay })).toEqual({ bay });
  });
});

describe('JobListFilters', () => {
  it('defaults to no job list filters', () => {
    expect(JobListFilters.parse(undefined)).toEqual({});
  });

  it('allows other filters without status filters', () => {
    expect(JobListFilters.parse({ jobId: '00000000-0000-4000-8000-000000000001' })).toEqual({
      jobId: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('accepts the invoiced-only filter', () => {
    expect(JobListFilters.parse({ invoicedOnly: true })).toEqual({ invoicedOnly: true });
  });
});

describe('JobColumnFilters', () => {
  it('defaults to no column filters', () => {
    expect(JobColumnFilters.parse(undefined)).toEqual({});
  });

  it('trims text filters and accepts customer ids', () => {
    expect(
      JobListInput.parse({
        columnFilters: {
          code: '  JOB-00042  ',
          customerId: '00000000-0000-4000-8000-000000000001',
          invoiceNumber: '  INV-0042  ',
          productSerialNumber: '  SN-0042  ',
        },
        sortBy: 'productSerialNumber',
      }),
    ).toMatchObject({
      columnFilters: {
        code: 'JOB-00042',
        customerId: '00000000-0000-4000-8000-000000000001',
        invoiceNumber: 'INV-0042',
        productSerialNumber: 'SN-0042',
      },
      sortBy: 'productSerialNumber',
    });
    expect(JobSortBy.parse('productSerialNumber')).toBe('productSerialNumber');
  });
});

describe('JobPatchInput', () => {
  it('trims invoice numbers and turns blank values into null', () => {
    const id = '00000000-0000-4000-8000-000000000001';

    expect(JobPatchInput.parse({ id, invoiceNumber: '  INV-0042  ' })).toEqual({ id, invoiceNumber: 'INV-0042' });
    expect(JobPatchInput.parse({ id, invoiceNumber: '  ' })).toEqual({ id, invoiceNumber: null });
    expect(JobPatchInput.parse({ id })).toEqual({ id });
  });
});

describe('JobCustomerOptionListInput', () => {
  it('defaults to company-name sorting', () => {
    expect(JobCustomerOptionListInput.parse({ search: '  Acme  ' })).toMatchObject({
      page: 1,
      pageSize: 10,
      search: 'Acme',
      sortBy: 'companyName',
      sortDirection: 'asc',
    });
  });
});

describe('JobCreateInput', () => {
  const quoteId = '00000000-0000-4000-8000-000000000001';
  const bayOneId = '00000000-0000-4000-8000-000000000002';
  const bayTwoId = '00000000-0000-4000-8000-000000000003';

  it('defaults missing Bay seeds to an empty list', () => {
    expect(JobCreateInput.parse({ quoteId })).toEqual({
      baySeeds: [],
      quoteId,
    });
    expect(JobCreateInput.parse({ baySeeds: [], quoteId })).toEqual({
      baySeeds: [],
      quoteId,
    });
  });

  it('accepts positive integer Bay seed durations and preserves row order', () => {
    expect(
      JobCreateInput.parse({
        baySeeds: [
          { bayId: bayOneId, durationDays: 3 },
          { bayId: bayTwoId, durationDays: 1 },
          { bayId: bayOneId, durationDays: 2 },
        ],
        quoteId,
      }),
    ).toEqual({
      baySeeds: [
        { bayId: bayOneId, durationDays: 3 },
        { bayId: bayTwoId, durationDays: 1 },
        { bayId: bayOneId, durationDays: 2 },
      ],
      quoteId,
    });
  });

  it('rejects non-positive and fractional Bay seed durations', () => {
    for (const durationDays of [0, -1, 1.5]) {
      expect(() =>
        JobCreateInput.parse({
          baySeeds: [{ bayId: bayOneId, durationDays }],
          quoteId,
        }),
      ).toThrow();
    }
  });
});

describe('JobDetail', () => {
  it('carries part units in the CFO projection', () => {
    expect(
      JobDetail.shape.cfo.parse([
        {
          assemblyName: 'Hydraulics',
          kind: 'standard',
          parts: [
            {
              partCode: 'HOSE-001',
              partId: '00000000-0000-4000-8000-000000000001',
              partName: 'Hydraulic Hose',
              quantity: 6000,
              unitOfMeasure: 'mm',
            },
          ],
        },
      ]),
    ).toEqual([
      {
        assemblyName: 'Hydraulics',
        kind: 'standard',
        parts: [
          {
            partCode: 'HOSE-001',
            partId: '00000000-0000-4000-8000-000000000001',
            partName: 'Hydraulic Hose',
            quantity: 6000,
            unitOfMeasure: 'mm',
          },
        ],
      },
    ]);
  });
});

describe('JobSlot schemas', () => {
  it('accepts booking inputs with positive day durations', () => {
    expect(
      BookJobSlotInput.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        durationDays: 1,
        jobId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toMatchObject({
      durationDays: 1,
    });
    expect(() =>
      BookJobSlotInput.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        durationDays: 0,
        jobId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toThrow();
  });

  it('normalizes projected work slot dates and job codes at the schema boundary', () => {
    expect(
      ProjectedJobSlot.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
        durationDays: 1,
        endDate: '2026-06-06',
        id: '00000000-0000-4000-8000-000000000003',
        jobCode: 12,
        jobId: '00000000-0000-4000-8000-000000000002',
        jobUnfinished: true,
        kind: 'work',
        label: null,
        sequence: 1,
        startDate: '2026-06-05',
        state: 'active',
        updatedAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    ).toMatchObject({
      endDate: '2026-06-06',
      jobCode: 'JOB-00012',
      jobUnfinished: true,
      startDate: '2026-06-05',
      state: 'active',
    });
  });

  it('normalizes projected idle slots without job fields', () => {
    expect(
      ProjectedJobSlot.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
        durationDays: 1,
        endDate: '2026-06-06',
        id: '00000000-0000-4000-8000-000000000003',
        jobId: null,
        kind: 'idle',
        label: 'Idle gap',
        sequence: 1,
        startDate: '2026-06-05',
        state: 'scheduled',
        updatedAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    ).toMatchObject({
      endDate: '2026-06-06',
      kind: 'idle',
      label: 'Idle gap',
      startDate: '2026-06-05',
      state: 'scheduled',
    });
  });

  it('accepts Board preview seeds and split-half output slots', () => {
    expect(
      BoardPreviewInput.parse({
        from: '2026-06-01',
        seeds: [
          {
            bayId: '00000000-0000-4000-8000-000000000001',
            durationDays: 3,
            startDate: '2026-06-09',
          },
        ],
      }),
    ).toEqual({
      from: '2026-06-01',
      seeds: [
        {
          bayId: '00000000-0000-4000-8000-000000000001',
          durationDays: 3,
          startDate: '2026-06-09',
        },
      ],
    });

    expect(
      BoardPreviewResult.parse({
        bays: [
          {
            calendarExceptions: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            currentOperator: null,
            department: 'fabrication',
            disabledAt: null,
            id: '00000000-0000-4000-8000-000000000001',
            name: 'Fabrication Bay',
            nextAvailableDate: '2026-06-12',
            scheduleOrigin: '2026-06-05',
            slots: [
              {
                bayId: '00000000-0000-4000-8000-000000000001',
                createdAt: '2026-06-05T00:00:00.000Z',
                durationDays: 4,
                endDate: '2026-06-09',
                id: '00000000-0000-4000-8000-000000000003:before',
                jobCode: 12,
                jobId: '00000000-0000-4000-8000-000000000002',
                jobUnfinished: true,
                kind: 'work',
                label: null,
                previewSplit: {
                  half: 'before',
                  sourceSlotId: '00000000-0000-4000-8000-000000000003',
                },
                sequence: 1,
                startDate: '2026-06-05',
                state: 'active',
                updatedAt: '2026-06-05T00:00:00.000Z',
              },
            ],
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        ghosts: [
          {
            bayId: '00000000-0000-4000-8000-000000000001',
            durationDays: 3,
            endDate: '2026-06-12',
            id: 'ghost:00000000-0000-4000-8000-000000000001:0',
            placementType: 'split',
            seedIndex: 0,
            startDate: '2026-06-09',
          },
        ],
        placements: [
          {
            afterDays: 6,
            beforeDays: 4,
            startDate: '2026-06-09',
            targetSlot: {
              bayId: '00000000-0000-4000-8000-000000000001',
              createdAt: '2026-06-05T00:00:00.000Z',
              durationDays: 10,
              endDate: '2026-06-15',
              id: '00000000-0000-4000-8000-000000000003',
              jobCode: 12,
              jobId: '00000000-0000-4000-8000-000000000002',
              jobUnfinished: true,
              kind: 'work',
              label: null,
              sequence: 1,
              startDate: '2026-06-05',
              state: 'active',
              updatedAt: '2026-06-05T00:00:00.000Z',
            },
            type: 'split',
          },
        ],
      }),
    ).toMatchObject({
      bays: [{ slots: [{ id: '00000000-0000-4000-8000-000000000003:before', jobCode: 'JOB-00012' }] }],
      placements: [{ type: 'split' }],
    });
  });

  it('returns the inserted slot from booking mutations without projection fields', () => {
    expect(
      BookJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: '00000000-0000-4000-8000-000000000002',
          kind: 'work',
          label: null,
          sequence: 1,
          updatedAt: new Date('2026-06-05T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      slot: {
        createdAt: '2026-06-05T00:00:00.000Z',
        durationDays: 1,
        sequence: 1,
      },
    });
  });

  it('accepts resize inputs with positive day durations', () => {
    expect(
      ResizeJobSlotInput.parse({
        durationDays: 2,
        slotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toMatchObject({
      durationDays: 2,
    });
    expect(() =>
      ResizeJobSlotInput.parse({
        durationDays: 0,
        slotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toThrow();
  });

  it('returns the resized slot without projection fields', () => {
    expect(
      ResizeJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 2,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: '00000000-0000-4000-8000-000000000002',
          kind: 'work',
          label: null,
          sequence: 1,
          updatedAt: new Date('2026-06-06T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      slot: {
        durationDays: 2,
        updatedAt: '2026-06-06T00:00:00.000Z',
      },
    });
  });

  it('accepts remove inputs with a valid slot id', () => {
    expect(
      RemoveJobSlotInput.parse({
        slotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toMatchObject({
      slotId: '00000000-0000-4000-8000-000000000003',
    });
    expect(() =>
      RemoveJobSlotInput.parse({
        slotId: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('returns the removed slot without projection fields', () => {
    expect(
      RemoveJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: null,
          kind: 'idle',
          label: null,
          sequence: 2,
          updatedAt: new Date('2026-06-06T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      slot: {
        createdAt: '2026-06-05T00:00:00.000Z',
        sequence: 2,
        updatedAt: '2026-06-06T00:00:00.000Z',
      },
    });
  });

  it('accepts move inputs with a valid slot id and direction', () => {
    expect(
      MoveJobSlotInput.parse({
        direction: 'left',
        slotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toEqual({
      direction: 'left',
      slotId: '00000000-0000-4000-8000-000000000003',
    });
    expect(() =>
      MoveJobSlotInput.parse({
        direction: 'up',
        slotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toThrow();
    expect(() =>
      MoveJobSlotInput.parse({
        direction: 'right',
        slotId: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('returns the moved slot without projection fields', () => {
    expect(
      MoveJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: null,
          kind: 'idle',
          label: null,
          sequence: 1,
          updatedAt: new Date('2026-06-06T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      slot: {
        sequence: 1,
        updatedAt: '2026-06-06T00:00:00.000Z',
      },
    });
  });

  it('requires work slots to have a job and idle slots to have no job', () => {
    expect(() =>
      BookJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: null,
          kind: 'work',
          label: null,
          sequence: 1,
          updatedAt: new Date('2026-06-05T00:00:00.000Z'),
        },
      }),
    ).toThrow();

    expect(() =>
      RemoveJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: '00000000-0000-4000-8000-000000000002',
          kind: 'idle',
          label: null,
          sequence: 1,
          updatedAt: new Date('2026-06-05T00:00:00.000Z'),
        },
      }),
    ).toThrow();
  });

  it('accepts target-slot idle insertion inputs', () => {
    expect(
      AddIdleJobSlotInput.parse({
        durationDays: 1,
        label: null,
        placement: 'before',
        targetSlotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toEqual({
      durationDays: 1,
      label: null,
      placement: 'before',
      targetSlotId: '00000000-0000-4000-8000-000000000003',
    });
    expect(() =>
      AddIdleJobSlotInput.parse({
        durationDays: 0,
        placement: 'after',
        targetSlotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toThrow();
  });

  it('returns the inserted idle slot without a persisted default label', () => {
    expect(
      AddIdleJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: null,
          kind: 'idle',
          label: null,
          sequence: 2,
          updatedAt: new Date('2026-06-06T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      slot: {
        kind: 'idle',
        label: null,
        sequence: 2,
      },
    });
  });
});

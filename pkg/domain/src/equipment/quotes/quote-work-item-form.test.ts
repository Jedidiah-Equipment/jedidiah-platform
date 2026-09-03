import { describe, expect, it } from 'vitest';

import { quoteDepartmentLabels } from '../departments.js';
import { getWorkItemFormTotal, quoteWorkItemSummaryRows, toQuoteWorkItemFormState } from './quote-work-item-form.js';
import { WORK_ITEM_DEPARTMENTS, workItemDepartmentRate } from './work-item-departments.js';

describe('Quote Work Item form helpers', () => {
  const workItem = {
    department: null,
    description: null,
    hourlyRate: 850,
    hours: 1.5,
    name: 'Strip pump',
    parts: [{ name: 'Seal kit', quantity: 2, unitPrice: 125 }],
  };

  it('projects persisted Custom Quote rows into editable form values', () => {
    expect(
      toQuoteWorkItemFormState({
        kind: 'custom',
        workItems: [
          {
            ...workItem,
            id: 'internal-work-item-id',
            parts: [{ id: 'internal-part-id', name: 'Seal kit', quantity: 2, unitPrice: 125 }],
          },
        ],
      }),
    ).toEqual({ workItems: [workItem] });
    expect(toQuoteWorkItemFormState({ kind: 'product' })).toEqual({ workItems: [] });
  });

  it('returns zero while a numeric field contains an incomplete form value', () => {
    expect(getWorkItemFormTotal({ workItem: { ...workItem, hourlyRate: Number.NaN } })).toBe(0);
    expect(getWorkItemFormTotal({ workItem: { ...workItem, hours: Number.NaN } })).toBe(0);
    expect(
      getWorkItemFormTotal({
        workItem: { ...workItem, parts: [{ name: 'Seal kit', quantity: 2, unitPrice: Number.NaN }] },
      }),
    ).toBe(0);
  });

  it('uses the canonical pricing calculation for editor totals and summary rows', () => {
    const labourItem = { ...workItem, department: 'fabrication' as const, hourlyRate: 850, name: null };

    expect(getWorkItemFormTotal({ workItem: labourItem })).toBe(1525);
    expect(quoteWorkItemSummaryRows({ workItems: [labourItem] })).toEqual([
      {
        charges: [
          { amount: 1275, kind: 'labour', label: 'Labour', part: null, quantity: 1.5, unitPrice: 850 },
          { amount: 250, kind: 'part', label: 'Seal kit', part: labourItem.parts[0], quantity: 2, unitPrice: 125 },
        ],
        description: null,
        name: 'Fabrication',
        total: 1525,
        workItem: labourItem,
      },
    ]);
  });

  it('reads an Other line as a single flat-amount row, never as labour', () => {
    const [sundries] = quoteWorkItemSummaryRows({
      workItems: [{ department: null, description: null, hourlyRate: 2500, hours: 1, name: 'Sundries', parts: [] }],
    });

    expect(sundries).toMatchObject({ charges: [], name: 'Sundries', total: 2500 });
  });

  it('names a departmental Work Item from the shop’s quoting label, not its stored name', () => {
    const rows = quoteWorkItemSummaryRows({
      workItems: [
        {
          department: 'assembly',
          description: 'Strip and assemble',
          hourlyRate: 320,
          hours: 36,
          name: null,
          parts: [],
        },
        { department: 'paint', description: null, hourlyRate: 375, hours: 10, name: null, parts: [] },
      ],
    });

    expect(rows.map((row) => ({ description: row.description, name: row.name, total: row.total }))).toEqual([
      { description: 'Strip and assemble', name: 'Assembly', total: 11520 },
      { description: null, name: 'Paintshop', total: 3750 },
    ]);
  });

  it('prices each Work Item at its own rate so one Quote can mix Departments', () => {
    const rows = quoteWorkItemSummaryRows({
      workItems: [
        { department: 'fabrication', description: null, hourlyRate: 550, hours: 56, name: null, parts: [] },
        { department: 'assembly', description: null, hourlyRate: 320, hours: 36, name: null, parts: [] },
      ],
    });

    expect(rows.map((row) => row.total)).toEqual([30800, 11520]);
  });

  it('adds Workshop to the rate card without changing the existing departments', () => {
    expect(WORK_ITEM_DEPARTMENTS).toEqual(['fabrication', 'paint', 'assembly', 'workshop']);
    expect(workItemDepartmentRate('assembly')).toBe(320);
    expect(workItemDepartmentRate('workshop')).toBe(320);
    expect(quoteDepartmentLabels.assembly).toBe('Assembly');
    expect(quoteDepartmentLabels.workshop).toBe('Workshop');
    expect(new Set(WORK_ITEM_DEPARTMENTS.map((department) => quoteDepartmentLabels[department])).size).toBe(
      WORK_ITEM_DEPARTMENTS.length,
    );
  });
});

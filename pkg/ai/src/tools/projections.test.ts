import { describe, expect, test } from 'vitest';

import { prepareAiToolResultForModel, projectJob } from './projections.js';

describe('tool result projections', () => {
  test('removes thumbnail data URLs at any nesting depth before results reach the model', () => {
    const result = prepareAiToolResultForModel({
      customerThumbnailDataUrl: 'data:image/png;base64,customer',
      id: 'customer-id',
      nested: {
        keep: 'value',
        productThumbnailDataUrl: 'data:image/png;base64,product',
      },
      users: [
        {
          name: 'Planner User',
          thumbnailDataUrl: 'data:image/png;base64,user',
        },
      ],
    });

    expect(JSON.stringify(result.result)).not.toContain('thumbnailDataUrl');
    expect(result.result).toEqual({
      id: 'customer-id',
      nested: {
        keep: 'value',
      },
      users: [
        {
          name: 'Planner User',
        },
      ],
    });
    expect(result.size).toMatchObject({
      removedThumbnailFieldsByFallback: 3,
      truncated: false,
    });
  });

  test('slims Job detail schedules to the target Job work slots', () => {
    const projected = projectJob({
      code: 'JOB-00001',
      id: '00000000-0000-4000-8000-000000000001',
      schedule: [
        {
          bays: [
            {
              currentOperator: {
                id: 'operator-id',
                name: 'Operator',
                thumbnailDataUrl: 'data:image/png;base64,operator',
              },
              id: 'bay-1',
              slots: [
                {
                  jobCode: 'JOB-00001',
                  jobId: '00000000-0000-4000-8000-000000000001',
                  kind: 'work',
                },
                {
                  jobCode: 'JOB-00002',
                  jobId: '00000000-0000-4000-8000-000000000002',
                  kind: 'work',
                },
                {
                  jobId: null,
                  kind: 'idle',
                },
              ],
            },
            {
              id: 'bay-2',
              slots: [
                {
                  jobCode: 'JOB-00003',
                  jobId: '00000000-0000-4000-8000-000000000003',
                  kind: 'work',
                },
              ],
            },
          ],
          department: 'fabrication',
        },
      ],
    });

    expect(projected).toMatchObject({
      schedule: [
        {
          bays: [
            {
              currentOperator: {
                id: 'operator-id',
                name: 'Operator',
              },
              id: 'bay-1',
              slots: [
                {
                  jobCode: 'JOB-00001',
                  jobId: '00000000-0000-4000-8000-000000000001',
                  kind: 'work',
                },
              ],
            },
          ],
          department: 'fabrication',
        },
      ],
    });
    expect(JSON.stringify(projected)).not.toContain('thumbnailDataUrl');
  });

  test('truncates oversized arrays with an explicit marker', () => {
    const result = prepareAiToolResultForModel(
      {
        items: Array.from({ length: 20 }, (_, index) => ({
          description: `item ${index} ${'x'.repeat(100)}`,
          id: index,
        })),
      },
      { maxSerializedBytes: 700 },
    );

    expect(result.size.truncated).toBe(true);
    expect(result.size.serializedBytes).toBeLessThanOrEqual(700);
    expect(JSON.stringify(result.result)).toContain('__aiToolResultTruncatedItems');
  });

  test('preserves fixed schedule departments when nested slot arrays can be truncated', () => {
    const departments = ['Cutting', 'Welding', 'Paint', 'Assembly', 'Dispatch'];
    const result = prepareAiToolResultForModel(
      {
        schedule: departments.map((department) => ({
          bays: [
            {
              id: `${department.toLowerCase()}-bay`,
              slots: Array.from({ length: 12 }, (_, index) => ({
                id: `${department.toLowerCase()}-slot-${index}`,
                jobCode: `JOB-${index.toString().padStart(5, '0')}`,
                note: `slot progress detail ${index} ${'x'.repeat(80)}`,
              })),
            },
          ],
          department,
        })),
      },
      { maxSerializedBytes: 1_900 },
    );

    expect(result.size.truncated).toBe(true);
    expect(result.size.serializedBytes).toBeLessThanOrEqual(1_900);

    const projected = result.result as {
      schedule: Array<{ bays: Array<{ slots: unknown[] }>; department?: string }>;
    };
    expect(projected.schedule).toHaveLength(departments.length);
    expect(projected.schedule.map((department) => department.department)).toEqual(departments);
    const hasNestedSlotTruncation = projected.schedule.some((department) =>
      JSON.stringify(department.bays[0]?.slots).includes('__aiToolResultTruncatedItems'),
    );
    expect(hasNestedSlotTruncation).toBe(true);
  });

  test('truncates oversized list items instead of tiny per-item links arrays', () => {
    const result = prepareAiToolResultForModel({
      items: Array.from({ length: 120 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
        links: [
          {
            entity: 'Product',
            id: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
            label: `Product ${index}`,
          },
        ],
        name: `Product ${index} ${'x'.repeat(150)}`,
      })),
      total: 120,
    });

    expect(result.size.truncated).toBe(true);
    expect(result.size.serializedBytes).toBeLessThanOrEqual(24 * 1024);
    expect(result.result).not.toHaveProperty('__aiToolResultTruncated');

    const projected = result.result as { items: unknown[] };
    expect(projected.items).toHaveLength(61);
    expect(JSON.stringify(projected.items.at(-1))).toContain('__aiToolResultTruncatedItems');
    expect(JSON.stringify(projected.items[0])).toContain('"links"');
  });
});

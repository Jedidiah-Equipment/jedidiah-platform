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
      removedThumbnailFields: 3,
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
});

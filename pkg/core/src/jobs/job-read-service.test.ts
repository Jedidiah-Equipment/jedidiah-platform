import type { JobStageName } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { mapJobSummary } from './job-read-service.js';

describe('mapJobSummary', () => {
  it('maps jobs with stage summaries', () => {
    const summary = mapJobSummary({
      ...jobRow(),
      stages: [
        stageRow('procurement', 1),
        stageRow('supply', 2),
        stageRow('fabrication', 3),
        stageRow('paint', 4),
        stageRow('assembly', 5),
      ],
    });

    expect(summary.status).toBe('pending');
    expect(summary.stages).toHaveLength(5);
    expect(summary.stages.map((stage) => stage.stage)).toEqual([
      'procurement',
      'supply',
      'fabrication',
      'paint',
      'assembly',
    ]);
  });
});

function jobRow() {
  const now = new Date('2026-05-01T00:00:00.000Z');

  return {
    code: 1,
    createdAt: now,
    dueDate: null,
    id: '00000000-0000-4000-8000-000000000001',
    product: {
      modelCode: 'MODEL-001',
      name: 'Test Product',
    },
    productId: '00000000-0000-4000-8000-000000000002',
    quote: null,
    quoteId: null,
    status: 'pending' as const,
    updatedAt: now,
  };
}

function stageRow(stage: JobStageName, sequence: number) {
  return {
    id: stageRowIds[stage],
    jobId: '00000000-0000-4000-8000-000000000001',
    sequence,
    stage,
  };
}

const stageRowIds = {
  procurement: '00000000-0000-4000-8000-000000000101',
  supply: '00000000-0000-4000-8000-000000000102',
  fabrication: '00000000-0000-4000-8000-000000000103',
  paint: '00000000-0000-4000-8000-000000000104',
  assembly: '00000000-0000-4000-8000-000000000105',
} as const satisfies Record<JobStageName, string>;

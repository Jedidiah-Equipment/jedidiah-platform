import { describe, expect, it } from 'vitest';

import { deserializeSnapshotRows, serializeSnapshotRows } from './snapshot-json.js';
import type { SnapshotTableDefinition } from './snapshot-table-definitions.js';

const timestampConfig = {
  fileName: 'example.json',
  tableName: 'example',
  timestampColumns: ['createdAt', 'updatedAt'],
} satisfies SnapshotTableDefinition;

describe('snapshot JSON serialization', () => {
  it('serializes rows with stable pretty formatting and revives configured timestamps', () => {
    const createdAt = new Date('2026-05-28T08:00:00.000Z');
    const updatedAt = new Date('2026-05-28T09:15:00.000Z');
    const serialized = serializeSnapshotRows([
      {
        createdAt,
        id: 'row-id',
        name: 'Snapshot row',
        updatedAt,
      },
    ]);

    expect(serialized).toBe(
      '[\n  {\n    "createdAt": "2026-05-28T08:00:00.000Z",\n    "id": "row-id",\n    "name": "Snapshot row",\n    "updatedAt": "2026-05-28T09:15:00.000Z"\n  }\n]\n',
    );

    const [row] = deserializeSnapshotRows(timestampConfig, serialized);

    expect(row).toEqual({
      createdAt,
      id: 'row-id',
      name: 'Snapshot row',
      updatedAt,
    });
  });

  it('rejects non-array snapshots', () => {
    expect(() => deserializeSnapshotRows(timestampConfig, '{}')).toThrow(
      'Snapshot file example.json must contain an array',
    );
  });
});

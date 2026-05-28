import type { SnapshotRow, SnapshotTableConfig } from './snapshot-tables.js';

export function serializeSnapshotRows(rows: readonly SnapshotRow[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

export function deserializeSnapshotRows(config: SnapshotTableConfig, content: string): SnapshotRow[] {
  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed)) {
    throw new Error(`Snapshot file ${config.fileName} must contain an array`);
  }

  return parsed.map((row) => deserializeSnapshotRow(config, row));
}

function deserializeSnapshotRow(config: SnapshotTableConfig, row: unknown): SnapshotRow {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`Snapshot file ${config.fileName} contains a non-object row`);
  }

  const timestampColumns = new Set(config.timestampColumns);

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      timestampColumns.has(key) && typeof value === 'string' ? new Date(value) : value,
    ]),
  );
}

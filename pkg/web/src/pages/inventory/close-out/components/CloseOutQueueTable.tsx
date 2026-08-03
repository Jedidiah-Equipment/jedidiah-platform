import { formatDate } from '@pkg/domain';
import type { CloseOutQueueRow } from '@pkg/schema';
import { Link } from '@tanstack/react-router';

import { Badge } from '@/components/ui/badge.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';

export function CloseOutQueueTable({ items }: { items: readonly CloseOutQueueRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job</TableHead>
          <TableHead>Completed</TableHead>
          <TableHead>Waiting</TableHead>
          <TableHead className="text-right">Drawn</TableHead>
          <TableHead className="text-right">Committed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.jobId}>
            <TableCell>
              <Link
                className="block font-medium hover:underline"
                params={{ jobId: item.jobId }}
                to="/inventory/close-out/$jobId"
              >
                {item.displayName}
              </Link>
              <span className="block font-mono text-muted-foreground text-xs">{item.code}</span>
            </TableCell>
            <TableCell>{formatDate(item.completedOn)}</TableCell>
            <TableCell>
              {/* Age is the stale-commitment report: the longer a Job waits, the louder the queue reads. */}
              {item.isStale ? (
                <Badge variant="destructive">{formatWaiting(item.ageDays)}</Badge>
              ) : (
                <span className="text-muted-foreground">{formatWaiting(item.ageDays)}</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{item.drawnQuantity}</TableCell>
            <TableCell className="text-right tabular-nums">{item.committedQuantity}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function formatWaiting(ageDays: number): string {
  if (ageDays === 0) return 'today';

  return ageDays === 1 ? '1 day' : `${ageDays} days`;
}

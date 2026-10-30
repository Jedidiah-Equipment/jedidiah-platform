import { formatHours } from '@pkg/domain';
import { IconArrowRight } from '@tabler/icons-react';
import type React from 'react';
import { Card, CardContent } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';

/** One recorded → corrected line: what stands on the left, the field that replaces it on the right. */
export function ReadingCaptureRow({
  label,
  recorded,
  loading = false,
  children,
}: {
  label: string;
  recorded: React.ReactNode;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(6rem,0.85fr)_1.25rem_minmax(0,1.3fr)] items-end gap-2">
      <div className="min-w-0 space-y-2">
        <span className="block text-xs font-medium">{label}</span>
        <div aria-busy={loading} className="flex h-8 items-center text-lg font-semibold text-primary">
          {loading ? (
            <>
              <Skeleton aria-hidden="true" className="h-6 w-24 motion-reduce:animate-none" />
              <span className="sr-only">Loading the previous reading…</span>
            </>
          ) : (
            recorded
          )}
        </div>
      </div>
      <IconArrowRight aria-hidden="true" className="mb-1.5 size-5 text-muted-foreground" />
      {children}
    </div>
  );
}

export function ReadingCaptureCard({
  previousValue,
  previousLabel = 'Previous reading',
  loading = false,
  children,
  rows,
}: {
  /** Null means there is no earlier reading; undefined means it is unavailable. */
  previousValue: number | null | undefined;
  previousLabel?: string;
  loading?: boolean;
  children: React.ReactNode;
  /** Further `ReadingCaptureRow`s under the hours. */
  rows?: React.ReactNode;
}) {
  return (
    <Card className="mt-2 bg-muted/30" size="sm">
      <CardContent className="space-y-3">
        <ReadingCaptureRow
          label={previousLabel}
          loading={loading}
          recorded={previousValue === undefined ? '—' : previousValue === null ? 'None' : formatHours(previousValue)}
        >
          {children}
        </ReadingCaptureRow>
        {rows}
      </CardContent>
    </Card>
  );
}

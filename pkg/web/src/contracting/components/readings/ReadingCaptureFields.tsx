import { formatDate, formatHours, getPlantDateNow } from '@pkg/domain';
import { IconArrowRight } from '@tabler/icons-react';
import type React from 'react';
import { NumberField } from '@/components/form/fields/NumberField.js';
import { withFieldGroup } from '@/components/form/index.js';
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

/** Render inside a reading form's value AppField. */
function ReadingValueField({ label }: { label: string }) {
  return (
    <NumberField
      label={<span className="text-xs">{label}</span>}
      decimals={1}
      min={0}
      unit="hours"
      className="text-lg font-semibold md:text-lg"
    />
  );
}

/**
 * One reading's correction: the recorded hours and Read At beside the fields that replace them. The Job page's amend
 * mounts it once, a Dispute's resolve once per reading, both over a `ReadingCorrection`.
 */
export const ReadingCorrectionFields = withFieldGroup({
  defaultValues: { value: 0, readAt: '' },
  props: {} as { recorded: { value: number; capturedAt: string } | null },
  render: function ReadingCorrectionFieldsGroup({ group, recorded }) {
    return (
      <ReadingCaptureCard
        previousLabel="Recorded reading"
        previousValue={recorded?.value}
        rows={
          <ReadingCaptureRow
            label="Recorded Read At"
            recorded={<span className="text-sm">{recorded ? formatDate(recorded.capturedAt, 'medium') : '—'}</span>}
          >
            <group.AppField name="readAt">
              {(field) => <field.DateTimePickerField label="Corrected Read At" maxValue={getPlantDateNow()} />}
            </group.AppField>
          </ReadingCaptureRow>
        }
      >
        <group.AppField name="value">{() => <ReadingValueField label="Corrected reading" />}</group.AppField>
      </ReadingCaptureCard>
    );
  },
});

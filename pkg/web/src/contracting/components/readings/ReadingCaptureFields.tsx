import { formatHours } from '@pkg/domain';
import { captureRefusals, isFutureReadAt, READING_PHOTO_POLICY, readAtFromInput } from '@pkg/domain/contracting';
import { IconArrowRight } from '@tabler/icons-react';
import type React from 'react';
import { useState } from 'react';
import { NumberField } from '@/components/form/fields/NumberField.js';
import { withFieldGroup } from '@/components/form/index.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { PhotoPicker } from '@/contracting/components/PhotoPicker.js';
import type { ConfirmedDispute, ReadingCapture } from './use-reading-capture.js';

export function ReadingCaptureCard({
  previousValue,
  previousLabel = 'Previous reading',
  loading = false,
  children,
  warning,
}: {
  /** Null means there is no earlier reading; undefined means it is unavailable. */
  previousValue: number | null | undefined;
  previousLabel?: string;
  loading?: boolean;
  children: React.ReactNode;
  warning?: React.ReactNode;
}) {
  return (
    <Card className="mt-2 bg-muted/30" size="sm">
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[minmax(6rem,0.85fr)_1.25rem_minmax(0,1.3fr)] items-end gap-2">
          <div className="min-w-0 space-y-2">
            <span className="block text-xs font-medium">{previousLabel}</span>
            <div aria-busy={loading} className="flex h-8 items-center text-lg font-semibold text-primary">
              {loading ? (
                <>
                  <Skeleton aria-hidden="true" className="h-6 w-24 motion-reduce:animate-none" />
                  <span className="sr-only">Loading the previous reading…</span>
                </>
              ) : previousValue === undefined ? (
                '—'
              ) : previousValue === null ? (
                'None'
              ) : (
                formatHours(previousValue)
              )}
            </div>
          </div>
          <IconArrowRight aria-hidden="true" className="mb-1.5 size-5 text-muted-foreground" />
          {children}
        </div>
        {warning}
      </CardContent>
    </Card>
  );
}

/** The below-latest warning: confirming the previous reading is wrong records the value and disputes it. */
export function DisputeField({
  id,
  value,
  previous,
  checked,
  onCheckedChange,
  onBlur,
}: {
  id: string;
  value: number;
  previous: number;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onBlur?: () => void;
}) {
  return (
    <div className="rounded-lg border border-warning/45 bg-warning/10 p-3">
      <Field orientation="horizontal">
        <Checkbox
          checked={checked}
          id={id}
          onBlur={onBlur}
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor={id}>The previous reading is wrong</FieldLabel>
          <FieldDescription>
            Record {formatHours(value)} and dispute the {formatHours(previous)} reading.
          </FieldDescription>
        </FieldContent>
      </Field>
    </div>
  );
}

/** Render inside a reading form's value AppField. */
export function ReadingValueField({
  min = 0,
  label = 'Current reading',
  onInput,
}: {
  min?: number;
  label?: string;
  onInput?: React.FormEventHandler<HTMLInputElement>;
}) {
  return (
    <NumberField
      label={<span className="text-xs">{label}</span>}
      decimals={1}
      min={min}
      unit="hours"
      className="text-lg font-semibold md:text-lg"
      onInput={onInput}
    />
  );
}

/**
 * The previous reading beside the value being captured, with the dispute offered once a value below the previous one
 * loses focus. Every capture dialog mounts it over its `value` and `confirmedDispute` fields; typing clears a dispute,
 * which belongs to the value it was confirmed for.
 */
export const ReadingValueCard = withFieldGroup({
  defaultValues: { value: Number.NaN, confirmedDispute: null as ConfirmedDispute, readAt: '' },
  props: {} as { capture: Pick<ReadingCapture<unknown>, 'judgeValue' | 'latest' | 'latestQuery'> },
  render: function ReadingValueCardGroup({ group, capture }) {
    const [readingFocused, setReadingFocused] = useState(false);
    const { latest, latestQuery } = capture;
    return (
      <ReadingCaptureCard
        previousValue={latest === undefined ? undefined : (latest?.value ?? null)}
        loading={latestQuery.isPending}
        warning={
          <group.Subscribe selector={(state) => state.values}>
            {(values) => {
              const verdict = capture.judgeValue({ ...values, readAt: readAtFromInput(values.readAt) });
              return !readingFocused && latest && verdict.below ? (
                <group.AppField name="confirmedDispute">
                  {(field) => (
                    <DisputeField
                      checked={verdict.disputeConfirmed}
                      id={field.name}
                      onBlur={field.handleBlur}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked ? { value: values.value, previousId: latest.id } : null)
                      }
                      previous={latest.value}
                      value={values.value}
                    />
                  )}
                </group.AppField>
              ) : null;
            }}
          </group.Subscribe>
        }
      >
        <div onFocusCapture={() => setReadingFocused(true)} onBlurCapture={() => setReadingFocused(false)}>
          <group.AppField name="value">
            {() => <ReadingValueField onInput={() => group.setFieldValue('confirmedDispute', null)} />}
          </group.AppField>
        </div>
      </ReadingCaptureCard>
    );
  },
});

/** When the meter was read, as a `datetime-local` value; blank is now, and a time still to come is refused. */
export const ReadingReadAtField = withFieldGroup({
  defaultValues: { readAt: '' },
  render: function ReadingReadAtFieldGroup({ group }) {
    return (
      <>
        <group.AppField name="readAt">
          {(field) => (
            <field.TextField
              label="Read At"
              type="datetime-local"
              description="When the meter was read. Leave blank to use the current time."
            />
          )}
        </group.AppField>
        <group.Subscribe selector={(state) => readAtFromInput(state.values.readAt)}>
          {(readAt) =>
            readAt && isFutureReadAt(readAt) ? (
              <p className="text-sm text-destructive" role="alert">
                {captureRefusals['future-read-at'].message}
              </p>
            ) : null
          }
        </group.Subscribe>
      </>
    );
  },
});

export function ReadingCaptureDetails({
  id,
  photo,
  onPhotoChange,
  error,
  onError,
  children,
}: {
  id: string;
  photo: File | null;
  onPhotoChange: (photo: File | null) => void;
  error: string;
  onError: (message: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-4 border-t pt-4">
      <PhotoPicker
        id={id}
        label="Meter photo"
        policy={READING_PHOTO_POLICY}
        photo={photo}
        onChange={onPhotoChange}
        onError={onError}
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}

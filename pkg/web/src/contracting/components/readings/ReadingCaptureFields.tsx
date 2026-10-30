import { formatDate, formatHours, getPlantDateNow } from '@pkg/domain';
import {
  belowLatestSentence,
  captureRefusals,
  isFutureReadAt,
  READING_PHOTO_POLICY,
  readAtInputValue,
  readAtOf,
  readAtProposal,
  readAtSuggestionSentence,
} from '@pkg/domain/contracting';
import type { LatestReading } from '@pkg/schema/contracting';
import { IconArrowRight } from '@tabler/icons-react';
import type React from 'react';
import { useId, useState } from 'react';
import { DateTimeInput } from '@/components/form/fields/DateTimePickerField.js';
import { NumberField } from '@/components/form/fields/NumberField.js';
import { withFieldGroup } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { PhotoPicker } from '@/contracting/components/PhotoPicker.js';
import type { ConfirmedDispute, ReadingCapture } from './use-reading-capture.js';

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
  warning,
}: {
  /** Null means there is no earlier reading; undefined means it is unavailable. */
  previousValue: number | null | undefined;
  previousLabel?: string;
  loading?: boolean;
  children: React.ReactNode;
  /** Further `ReadingCaptureRow`s under the hours. */
  rows?: React.ReactNode;
  warning?: React.ReactNode;
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
        {warning}
      </CardContent>
    </Card>
  );
}

/**
 * The below-latest warning. The fix is usually when the meter was read, so it always offers Read earlier…; below a
 * human reading it also offers the dispute, which records the value and disputes the previous one.
 */
export function BelowLatestWarning({
  id,
  value,
  latest,
  dispute,
  onReadEarlier,
}: {
  id: string;
  value: number;
  latest: LatestReading;
  /** Null when the latest is beyond dispute. */
  dispute: { checked: boolean; onCheckedChange: (checked: boolean) => void; onBlur?: () => void } | null;
  onReadEarlier: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-warning/45 bg-warning/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">{belowLatestSentence(latest)}</p>
        <Button onClick={onReadEarlier} size="sm" type="button" variant="outline">
          Read earlier…
        </Button>
      </div>
      {dispute ? (
        <Field orientation="horizontal">
          <Checkbox
            checked={dispute.checked}
            id={id}
            onBlur={dispute.onBlur}
            onCheckedChange={(next) => dispute.onCheckedChange(next === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor={id}>The previous reading is wrong</FieldLabel>
            <FieldDescription>
              Record {formatHours(value)} and dispute the {formatHours(latest.value)} reading.
            </FieldDescription>
          </FieldContent>
        </Field>
      ) : null}
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
 * The previous reading beside the value being captured, with the below-latest warning once a value below the previous
 * one loses focus. Every capture dialog mounts it over its `value` and `confirmedDispute` fields; typing clears a
 * dispute, which belongs to the value it was confirmed for, and the reports a proposed Read At came from, which belong to
 * the value refused.
 */
export const ReadingValueCard = withFieldGroup({
  defaultValues: { value: Number.NaN, confirmedDispute: null as ConfirmedDispute },
  props: {} as {
    capture: Pick<ReadingCapture<unknown>, 'judgeValue' | 'latest' | 'latestQuery' | 'readEarlier' | 'editValue'>;
  },
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
              const verdict = capture.judgeValue(values);
              return !readingFocused && latest && verdict.below ? (
                <group.AppField name="confirmedDispute">
                  {(field) => (
                    <BelowLatestWarning
                      dispute={
                        verdict.disputable
                          ? {
                              checked: verdict.disputeConfirmed,
                              onBlur: field.handleBlur,
                              onCheckedChange: (checked) =>
                                field.handleChange(checked ? { value: values.value, previousId: latest.id } : null),
                            }
                          : null
                      }
                      id={field.name}
                      latest={latest}
                      onReadEarlier={capture.readEarlier}
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
            {() => (
              <ReadingValueField
                onInput={() => {
                  group.setFieldValue('confirmedDispute', null);
                  capture.editValue();
                }}
              />
            )}
          </group.AppField>
        </div>
      </ReadingCaptureCard>
    );
  },
});

/**
 * When the meter was read, asked first: Now posts the moment of capture, Earlier… reveals the picker and holds Save
 * until a time is picked. A Read At the server proposed lands in the picker with the reports it came from; a time
 * still to come is refused.
 */
export function ReadingReadAtField({
  capture,
}: {
  capture: Pick<ReadingCapture<unknown>, 'readAt' | 'readAtPicker' | 'chooseNow' | 'readEarlier' | 'pickReadAt'>;
}) {
  const { readAt } = capture;
  const choiceLabel = useId();
  // What the picker shows while it names no time, so a half-typed or wrong time stays on screen.
  const [typed, setTyped] = useState('');
  const earlier = readAt.kind === 'earlier';
  const at = readAtOf(readAt);
  const proposal = readAtProposal(readAt);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium" id={choiceLabel}>
          When was the meter read?
        </span>
        <fieldset aria-labelledby={choiceLabel} className="flex gap-1">
          <Button
            aria-pressed={!earlier}
            onClick={() => {
              setTyped('');
              capture.chooseNow();
            }}
            size="sm"
            type="button"
            variant={earlier ? 'outline' : 'default'}
          >
            Now
          </Button>
          <Button
            aria-pressed={earlier}
            onClick={capture.readEarlier}
            size="sm"
            type="button"
            variant={earlier ? 'default' : 'outline'}
          >
            Earlier…
          </Button>
        </fieldset>
      </div>
      {earlier ? (
        <div ref={capture.readAtPicker}>
          <DateTimeInput
            label="Read At"
            maxValue={getPlantDateNow()}
            name="readAt"
            onChange={(value) => {
              setTyped(value);
              capture.pickReadAt(value);
            }}
            value={at ? readAtInputValue(at) : typed}
            {...(proposal ? { description: readAtSuggestionSentence(proposal) } : {})}
          />
        </div>
      ) : null}
      {at && isFutureReadAt(at) ? (
        <p className="text-sm text-destructive" role="alert">
          {captureRefusals['future-read-at'].message}
        </p>
      ) : null}
    </div>
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

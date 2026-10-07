import { formatHours } from '@pkg/domain';
import { READING_PHOTO_POLICY } from '@pkg/domain/contracting';
import { IconArrowRight } from '@tabler/icons-react';
import type React from 'react';
import { NumberField } from '@/components/form/fields/NumberField.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { PhotoPicker } from '@/contracting/components/PhotoPicker.js';

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
      className="text-lg font-semibold md:text-lg"
      onInput={onInput}
    />
  );
}

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

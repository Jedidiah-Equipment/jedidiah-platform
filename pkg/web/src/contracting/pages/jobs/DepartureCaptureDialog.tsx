import { formatHours } from '@pkg/domain';
import { type Assignment, ReadingReason, ReadingValue, readingCaptureMultipartFields } from '@pkg/schema/contracting';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/index.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingCapturePath } from '@/contracting/lib/contracting-http-paths.js';
import { ReadingPhotoPicker } from './ReadingPhotoPicker.js';

const DepartureValues = z.object({ value: ReadingValue, reason: z.union([z.literal(''), ReadingReason]) });
export function DepartureCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) {
          setError('');
          setPhoto(null);
          onClose();
        }
      }}
      title={`Enter departure reading · ${stint?.machineCode ?? ''}`}
      defaultValues={{ value: stint?.arrival?.value ?? 0, reason: '' }}
      validator={DepartureValues}
      canSubmit={(values) => !!photo || !!values.reason.trim()}
      disableSubmitWhenInvalid
      onCreate={async (values) => {
        if (!stint) throw new Error('No Machine Assignment selected.');
        setError('');
        const body = new FormData();
        for (const [name, value] of readingCaptureMultipartFields({
          machineId: stint.machineId,
          assignmentId: stint.id,
          role: 'departure',
          value: values.value,
          capturedAt: new Date().toISOString(),
          comment: values.reason.trim() || null,
        }))
          body.append(name, value);
        if (photo) body.append('photo', photo, photo.name);
        const response = await fetch(readingCapturePath(), { method: 'POST', body, credentials: 'include' });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = payload?.message ?? 'Unable to capture departure reading.';
          setError(message);
          throw new Error(message);
        }
        await Promise.all([invalidateJobs(), invalidateReadings()]);
        toast.success('Departure reading captured');
        return true;
      }}
      onCreated={() => {
        setPhoto(null);
        onClose();
      }}
    >
      {(form) => (
        <>
          <p>Minimum allowed: {stint?.arrival ? formatHours(stint.arrival.value) : '—'}</p>
          <ReadingPhotoPicker
            id={`departure-photo-${stint?.id ?? 'closed'}`}
            photo={photo}
            onChange={setPhoto}
            onError={setError}
          />
          <p className="text-muted-foreground">
            {photo ? 'A reason is optional when you attach a photo.' : 'A reason is required without a photo.'}
          </p>
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          <form.AppField name="value">
            {(field) => <field.NumberField label="Hours" decimals={1} min={stint?.arrival?.value ?? 0} />}
          </form.AppField>
          <form.AppField name="reason">{(field) => <field.TextareaField label="Reason" />}</form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}

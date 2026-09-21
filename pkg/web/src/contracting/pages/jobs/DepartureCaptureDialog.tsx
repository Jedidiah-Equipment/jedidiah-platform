import { type Assignment, ReadingReason, ReadingValue, readingCaptureMultipartFields } from '@pkg/schema/contracting';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/index.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingCapturePath } from '@/contracting/lib/contracting-http-paths.js';

const DepartureValues = z.object({ value: ReadingValue, reason: ReadingReason });
export function DepartureCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const [error, setError] = useState('');
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) {
          setError('');
          onClose();
        }
      }}
      title={`Enter departure reading · ${stint?.machineCode ?? ''}`}
      defaultValues={{ value: stint?.arrival?.value ?? 0, reason: '' }}
      validator={DepartureValues}
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
          comment: values.reason,
        }))
          body.append(name, value);
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
      onCreated={onClose}
    >
      {(form) => (
        <>
          <p>Minimum allowed: {stint?.arrival?.value.toFixed(1) ?? '—'} h</p>
          <p className="text-muted-foreground">
            Typed by management without a photo. The reason is recorded on the reading.
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

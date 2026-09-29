import { formatHours } from '@pkg/domain';
import { type Assignment, ReadingReason, ReadingValue } from '@pkg/schema/contracting';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/index.js';
import { ReadingPhotoPicker } from './ReadingPhotoPicker.js';
import { useReadingCapture } from './use-reading-capture.js';

const DepartureValues = z.object({
  value: ReadingValue,
  reason: z.union([z.string().trim().length(0), ReadingReason]),
});
export function DepartureCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const capture = useReadingCapture();
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
        try {
          await capture(
            {
              machineId: stint.machineId,
              assignmentId: stint.id,
              role: 'departure',
              value: values.value,
              capturedAt: new Date().toISOString(),
              comment: values.reason.trim() || null,
            },
            photo,
            'Unable to capture departure reading.',
          );
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Unable to capture departure reading.');
          throw cause;
        }
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

import { formatDate, getPlantDateNow } from '@pkg/domain';
import {
  readingRoleLabels,
  stintWindowLabel,
  telematicsDisputeReason,
  telematicsProviderLabels,
} from '@pkg/domain/contracting';
import type { ReadingAmendInput, ReadingDispute } from '@pkg/schema/contracting';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Badge } from '@/components/ui/badge.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { MeterPhotoPreview } from '@/contracting/components/MeterPhotoPreview.js';
import { MeterPhoto, ReadingAiAssessment } from '@/contracting/components/readings/ReadingAiAssessment.js';
import {
  ReadingCaptureCard,
  ReadingCaptureRow,
  ReadingValueField,
} from '@/contracting/components/readings/ReadingCaptureFields.js';
import { cn } from '@/lib/utils.js';
import { DisputeResolveValues, disputeResolveDefaults, refusedReadingId, toReadingAmendInput } from './types.js';

const noDispute = { readings: [] };

export function DisputeResolveDialog({
  dispute,
  onOpenChange,
  onResolve,
  onResolved,
  error,
}: {
  /** The Dispute being resolved; null closes the dialog. */
  dispute: ReadingDispute | null;
  onOpenChange: (open: boolean) => void;
  onResolve: (input: ReadingAmendInput) => Promise<unknown>;
  onResolved: () => void;
  error: unknown;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const refusedId = refusedReadingId(error);
  const { reported } = dispute ?? { reported: null };
  return (
    <>
      <CreateEntityDialog
        key={dispute?.id ?? 'closed'}
        open={!!dispute}
        onOpenChange={onOpenChange}
        title={<MachineDialogTitle machine={dispute}>Resolve Dispute</MachineDialogTitle>}
        description="Correct the hours or Read At of each reading until they sit in sequence. One reason covers the Dispute."
        contentClassName="sm:max-w-2xl"
        submitLabel="Resolve"
        defaultValues={disputeResolveDefaults(dispute ?? noDispute)}
        validator={DisputeResolveValues}
        onCreate={(values) => (dispute ? onResolve(toReadingAmendInput(values, dispute)) : Promise.resolve())}
        onCreated={onResolved}
      >
        {(form) => (
          <>
            {reported?.telematicsProvider ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{telematicsProviderLabels[reported.telematicsProvider]}</Badge>
                {telematicsDisputeReason({
                  telematicsProvider: reported.telematicsProvider,
                  value: reported.value,
                  capturedAt: new Date(reported.capturedAt),
                })}
              </p>
            ) : null}
            {dispute?.readings.map((reading, index) => (
              <section
                aria-label={`${readingRoleLabels[reading.role]} reading`}
                className={cn(
                  'space-y-2 rounded-lg border p-3',
                  reading.id === refusedId && 'border-destructive ring-1 ring-destructive/40',
                )}
                data-refused={reading.id === refusedId || undefined}
                key={reading.id}
              >
                <h3 className="flex flex-wrap items-center gap-x-1.5 text-sm">
                  <span className="font-semibold">{readingRoleLabels[reading.role]}</span>
                  {reading.stint ? (
                    <>
                      <span aria-hidden>·</span>
                      <Link
                        className="font-mono font-semibold hover:underline"
                        params={{ code: reading.stint.jobNumber }}
                        to="/contracting/jobs/$code"
                      >
                        {reading.stint.jobNumber}
                      </Link>
                      <span aria-hidden>·</span>
                      <span className="text-muted-foreground">{stintWindowLabel(reading.stint)}</span>
                    </>
                  ) : null}
                </h3>
                <ReadingCaptureCard
                  previousLabel="Recorded reading"
                  previousValue={reading.value}
                  rows={
                    <ReadingCaptureRow
                      label="Recorded Read At"
                      recorded={<span className="text-sm">{formatDate(reading.capturedAt, 'medium')}</span>}
                    >
                      <form.AppField name={`readings[${index}].readAt`}>
                        {(field) => (
                          <field.DateTimePickerField label="Corrected Read At" maxValue={getPlantDateNow()} />
                        )}
                      </form.AppField>
                    </ReadingCaptureRow>
                  }
                >
                  <form.AppField name={`readings[${index}].value`}>
                    {() => <ReadingValueField label="Corrected reading" />}
                  </form.AppField>
                </ReadingCaptureCard>
                {reading.comment ? (
                  <p className="border-l-2 pl-2.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Capture comment</span> · {reading.comment}
                  </p>
                ) : null}
                {reading.photoBacked ? (
                  <>
                    <MeterPhoto className="h-40" onExpand={() => setPreviewId(reading.id)} reading={reading} />
                    <ReadingAiAssessment canReverify reading={reading} />
                  </>
                ) : null}
              </section>
            ))}
            <div className="space-y-4 border-t pt-4">
              <form.AppField name="reason">
                {(field) => <field.TextareaField label="Resolution reason" />}
              </form.AppField>
              <ErrorMessage error={error} fallbackMessage="Unable to resolve the Dispute." />
            </div>
          </>
        )}
      </CreateEntityDialog>
      <MeterPhotoPreview
        photo={previewId && dispute ? { readingId: previewId, machineCode: dispute.machineCode } : null}
        description="Captured meter photo"
        onClose={() => setPreviewId(null)}
      />
    </>
  );
}

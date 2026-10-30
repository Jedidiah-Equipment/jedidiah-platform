import {
  readingRoleLabels,
  stintWindowLabel,
  telematicsDisputeReason,
  telematicsProviderLabels,
} from '@pkg/domain/contracting';
import type { ReadingAmendInput, ReadingDispute } from '@pkg/schema/contracting';
import { Link } from '@tanstack/react-router';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { ReadingCorrectionFields } from '@/contracting/components/readings/ReadingCaptureFields.js';
import { cn } from '@/lib/utils.js';
import {
  DisputeResolveValues,
  disputeResolveDefaults,
  refusedReadingId,
  toReadingAmendInput,
  unpostableReason,
} from './types.js';

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
  const refusedId = refusedReadingId(error);
  const { reported } = dispute ?? { reported: null };
  return (
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
      canSubmit={(values) => !!dispute && unpostableReason(values, dispute) === null}
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
            <Card
              aria-label={`${readingRoleLabels[reading.role]} reading`}
              className={cn(reading.id === refusedId && 'border-destructive ring-1 ring-destructive/40')}
              data-refused={reading.id === refusedId || undefined}
              key={reading.id}
              role="group"
              size="sm"
            >
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-x-1.5">
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
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <ReadingCorrectionFields form={form} fields={`readings[${index}]`} recorded={reading} />
                {reading.comment ? (
                  <p className="border-l-2 pl-2.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Capture comment</span> · {reading.comment}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
          <div className="space-y-4 border-t pt-4">
            <form.AppField name="reason">{(field) => <field.TextareaField label="Resolution reason" />}</form.AppField>
            {dispute ? (
              <form.Subscribe selector={(state) => unpostableReason(state.values, dispute)}>
                {(reason) => (reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null)}
              </form.Subscribe>
            ) : null}
            <ErrorMessage error={error} fallbackMessage="Unable to resolve the Dispute." />
          </div>
        </>
      )}
    </CreateEntityDialog>
  );
}

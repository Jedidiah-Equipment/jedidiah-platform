import { readAtFromInput } from '@pkg/domain/contracting';
import { AuthId, UUID } from '@pkg/schema';
import { type Assignment, ReadingComment, ReadingValue } from '@pkg/schema/contracting';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { emptyStringOr, localDateTimeValue } from '@/components/form/utils/form-schema.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import {
  ReadingCaptureDetails,
  ReadingReadAtField,
  ReadingValueCard,
} from '@/contracting/components/readings/ReadingCaptureFields.js';
import { ConfirmedDispute, useReadingCapture } from '@/contracting/components/readings/use-reading-capture.js';
import { AssignmentEditorDialog, changesAssignment } from './AssignmentEditorDialog.js';
import { useAssignmentOptions } from './use-assignment-options.js';

const ArrivalValues = z.object({
  value: ReadingValue,
  comment: z.union([z.string().trim().length(0), ReadingComment]),
  confirmedDispute: ConfirmedDispute,
  readAt: localDateTimeValue,
  implementId: emptyStringOr(UUID),
  driverUserId: emptyStringOr(AuthId),
});
type ArrivalValues = z.infer<typeof ArrivalValues>;

export function ArrivalCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  // A refetch can change the live stint mid-capture; the form starts from, and overrides compare against, the opened one.
  const [opened, setOpened] = useState(stint);
  if (stint?.id !== opened?.id) setOpened(stint);
  const capture = useReadingCapture({ role: 'arrival', stint }, (values: ArrivalValues) => ({
    ...values,
    readAt: readAtFromInput(values.readAt),
    stintOverrides: changesAssignment(opened, values)
      ? { implementId: values.implementId || null, driverUserId: values.driverUserId || null }
      : undefined,
  }));
  const options = useAssignmentOptions({
    enabled: !!stint,
    stint,
    noImplementLabel: 'No implement',
    noDriverLabel: 'No driver',
    freeImplementsOnly: true,
  });
  const { latestQuery } = capture;
  const canCapture = (values: ArrivalValues) =>
    latestQuery.isSuccess &&
    (!changesAssignment(opened, values) || options.ready) &&
    capture.judge(values).request !== null;

  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) {
          capture.reset();
          onClose();
        }
      }}
      title={<MachineDialogTitle machine={stint}>Capture arrival</MachineDialogTitle>}
      contentClassName="sm:max-w-md"
      defaultValues={{
        value: Number.NaN,
        comment: '',
        confirmedDispute: null,
        readAt: '',
        implementId: opened?.implementId ?? '',
        driverUserId: opened?.driverUserId ?? '',
      }}
      validator={ArrivalValues}
      canSubmit={canCapture}
      disableSubmitWhenInvalid
      onBeforeCreate={canCapture}
      onCreate={async (values) => {
        await capture.submit(values);
        return true;
      }}
      onCreated={() => {
        capture.reset();
        onClose();
      }}
    >
      {(form) => (
        <>
          <ErrorMessage error={latestQuery.error} fallbackMessage="Unable to load the Machine's previous reading." />
          <ReadingReadAtField form={form} fields={{ readAt: 'readAt' }} capture={capture} />
          <ReadingValueCard
            form={form}
            fields={{ value: 'value', confirmedDispute: 'confirmedDispute', readAt: 'readAt' }}
            capture={capture}
          />
          <form.Subscribe
            selector={(state) => ({ implementId: state.values.implementId, driverUserId: state.values.driverUserId })}
          >
            {({ implementId, driverUserId }) => {
              const selectedImplement = options.implementOptions.find((entry) => entry.value === implementId);
              const implementLabel = selectedImplement?.label ?? 'No implement';
              const driverLabel =
                options.driverOptions.find((entry) => entry.value === driverUserId)?.label ?? 'No driver';
              return (
                <Card className="bg-muted/30" size="sm">
                  <CardHeader>
                    <CardTitle>Starting assignment</CardTitle>
                    <CardAction>
                      {stint ? (
                        <AssignmentEditorDialog
                          stint={{ ...stint, implementId: implementId || null, driverUserId: driverUserId || null }}
                          implementOptions={options.implementOptions}
                          driverOptions={options.driverOptions}
                          canSave={options.ready}
                          error={options.error}
                          submitLabel="Apply"
                          onSave={async (draft) => {
                            form.setFieldValue('implementId', draft.implementId);
                            form.setFieldValue('driverUserId', draft.driverUserId);
                          }}
                        />
                      ) : null}
                    </CardAction>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                    <div className="min-w-0 space-y-2">
                      <span className="block text-xs text-muted-foreground">Implement</span>
                      <span className="flex min-h-6 items-center gap-2">
                        {selectedImplement?.icon}
                        <span className="truncate" title={implementLabel}>
                          {implementLabel}
                        </span>
                      </span>
                    </div>
                    <div className="min-w-0 space-y-2">
                      <span className="block text-xs text-muted-foreground">Driver</span>
                      <span className="flex min-h-6 items-center truncate" title={driverLabel}>
                        {driverLabel}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            }}
          </form.Subscribe>
          <ReadingCaptureDetails id={`arrival-photo-${stint?.id ?? 'closed'}`} {...capture.details}>
            <form.AppField name="comment">
              {(field) => <field.TextareaField label="Comment (optional)" />}
            </form.AppField>
          </ReadingCaptureDetails>
        </>
      )}
    </CreateEntityDialog>
  );
}

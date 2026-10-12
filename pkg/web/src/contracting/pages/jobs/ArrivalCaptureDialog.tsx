import { AuthId, UUID } from '@pkg/schema';
import { type Assignment, ReadingComment, ReadingValue } from '@pkg/schema/contracting';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { emptyStringOr } from '@/components/form/utils/form-schema.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { AssignmentEditorDialog, changesAssignment } from './AssignmentEditorDialog.js';
import { DisputeField, ReadingCaptureCard, ReadingCaptureDetails, ReadingValueField } from './ReadingCaptureFields.js';
import { useAssignmentOptions } from './use-assignment-options.js';
import { ConfirmedDispute, useReadingCapture } from './use-reading-capture.js';

const ArrivalValues = z.object({
  value: ReadingValue,
  comment: z.union([z.string().trim().length(0), ReadingComment]),
  confirmedDispute: ConfirmedDispute,
  implementId: emptyStringOr(UUID),
  driverUserId: emptyStringOr(AuthId),
});

export function ArrivalCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const capture = useReadingCapture('arrival', stint);
  const [readingFocused, setReadingFocused] = useState(false);
  // A refetch can change the live stint mid-capture; the form starts from, and overrides compare against, the opened one.
  const [opened, setOpened] = useState(stint);
  if (stint?.id !== opened?.id) setOpened(stint);
  const options = useAssignmentOptions({
    enabled: !!stint,
    stint,
    noImplementLabel: 'No implement',
    noDriverLabel: 'No driver',
    freeImplementsOnly: true,
  });
  const { latestQuery, latest } = capture;
  const judge = (values: z.infer<typeof ArrivalValues>) =>
    capture.judge({
      ...values,
      stintOverrides: changesAssignment(opened, values)
        ? { implementId: values.implementId || null, driverUserId: values.driverUserId || null }
        : undefined,
    });
  const canCapture = (values: z.infer<typeof ArrivalValues>) =>
    latestQuery.isSuccess && (!changesAssignment(opened, values) || options.ready) && judge(values).request !== null;

  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) {
          capture.reset();
          setReadingFocused(false);
          onClose();
        }
      }}
      title={<MachineDialogTitle machine={stint}>Capture arrival</MachineDialogTitle>}
      contentClassName="sm:max-w-md"
      defaultValues={{
        value: Number.NaN,
        comment: '',
        confirmedDispute: null,
        implementId: opened?.implementId ?? '',
        driverUserId: opened?.driverUserId ?? '',
      }}
      validator={ArrivalValues}
      canSubmit={canCapture}
      disableSubmitWhenInvalid
      onBeforeCreate={canCapture}
      onCreate={async (values) => {
        const { request } = judge(values);
        if (!request) throw new Error('This reading cannot be captured yet.');
        await capture.submit(request);
        return true;
      }}
      onCreated={() => {
        capture.reset();
        setReadingFocused(false);
        onClose();
      }}
    >
      {(form) => (
        <>
          <ErrorMessage error={latestQuery.error} fallbackMessage="Unable to load the Machine's previous reading." />
          <ReadingCaptureCard
            previousValue={latest === undefined ? undefined : (latest?.value ?? null)}
            loading={latestQuery.isPending}
            warning={
              <form.Subscribe selector={(state) => state.values}>
                {(values) => {
                  const verdict = judge(values);
                  return !readingFocused && latest && verdict.below ? (
                    <form.AppField name="confirmedDispute">
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
                    </form.AppField>
                  ) : null;
                }}
              </form.Subscribe>
            }
          >
            <div onFocusCapture={() => setReadingFocused(true)} onBlurCapture={() => setReadingFocused(false)}>
              <form.AppField name="value">
                {() => <ReadingValueField onInput={() => form.setFieldValue('confirmedDispute', null)} />}
              </form.AppField>
            </div>
          </ReadingCaptureCard>
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

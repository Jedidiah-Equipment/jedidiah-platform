import { formatHours } from '@pkg/domain';
import { captureIsBelowLatest } from '@pkg/domain/contracting';
import { AuthId, UUID } from '@pkg/schema';
import { type Assignment, ReadingComment, ReadingValue } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { emptyStringOr } from '@/components/form/utils/form-schema.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useTRPC } from '@/lib/trpc.js';
import { AssignmentEditorDialog, changesAssignment } from './AssignmentEditorDialog.js';
import { ReadingCaptureCard, ReadingCaptureDetails, ReadingValueField } from './ReadingCaptureFields.js';
import { useAssignmentOptions } from './use-assignment-options.js';
import { useReadingCapture } from './use-reading-capture.js';

const ArrivalValues = z.object({
  value: ReadingValue,
  comment: z.union([z.string().trim().length(0), ReadingComment]),
  confirmedDispute: z.object({ value: ReadingValue, previousId: UUID }).nullable(),
  implementId: emptyStringOr(UUID),
  driverUserId: emptyStringOr(AuthId),
});

export function ArrivalCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const trpc = useTRPC();
  const capture = useReadingCapture('arrival');
  const [readingFocused, setReadingFocused] = useState(false);
  // A refetch can change the live stint mid-capture; the form starts from, and overrides compare against, the opened one.
  const [opened, setOpened] = useState(stint);
  if (stint?.id !== opened?.id) setOpened(stint);
  const history = useQuery(
    trpc.contractingReadings.fieldHistory.queryOptions({ machineId: stint?.machineId ?? '' }, { enabled: !!stint }),
  );
  const options = useAssignmentOptions({
    enabled: !!stint,
    stint,
    noImplementLabel: 'No implement',
    noDriverLabel: 'No driver',
    freeImplementsOnly: true,
  });
  const latest = history.data?.[0];
  const canCapture = (values: z.infer<typeof ArrivalValues>) =>
    history.isSuccess &&
    (!changesAssignment(opened, values) || options.ready) &&
    (!captureIsBelowLatest(values.value, latest) ||
      (values.confirmedDispute?.value === values.value && values.confirmedDispute.previousId === latest?.id));

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
        if (!stint) throw new Error('No Machine Assignment selected.');
        await capture.submit({
          machineId: stint.machineId,
          assignmentId: stint.id,
          value: values.value,
          comment: values.comment.trim() || null,
          disputePrevious:
            captureIsBelowLatest(values.value, latest) &&
            values.confirmedDispute?.value === values.value &&
            values.confirmedDispute.previousId === latest?.id,
          expectedPreviousId: latest?.id ?? null,
          stintOverrides: changesAssignment(opened, values)
            ? { implementId: values.implementId || null, driverUserId: values.driverUserId || null }
            : undefined,
        });
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
          <ErrorMessage error={history.error} fallbackMessage="Unable to load the Machine's previous reading." />
          <ReadingCaptureCard
            previousValue={history.isSuccess ? (latest?.value ?? null) : undefined}
            loading={history.isPending}
            warning={
              <form.Subscribe selector={(state) => state.values.value}>
                {(value) =>
                  !readingFocused && latest && captureIsBelowLatest(value, latest) ? (
                    <div className="rounded-lg border border-warning/45 bg-warning/10 p-3">
                      <form.AppField name="confirmedDispute">
                        {(field) => (
                          <Field orientation="horizontal">
                            <Checkbox
                              checked={field.state.value?.value === value && field.state.value.previousId === latest.id}
                              id={field.name}
                              onBlur={field.handleBlur}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true ? { value, previousId: latest.id } : null)
                              }
                            />
                            <FieldContent>
                              <FieldLabel htmlFor={field.name}>The previous reading is wrong</FieldLabel>
                              <FieldDescription>
                                Record {formatHours(value)} and dispute the {formatHours(latest.value)} reading.
                              </FieldDescription>
                            </FieldContent>
                          </Field>
                        )}
                      </form.AppField>
                    </div>
                  ) : null
                }
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

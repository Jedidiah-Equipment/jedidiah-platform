import { formatHours } from '@pkg/domain';
import { AuthId, UUID } from '@pkg/schema';
import { type Assignment, ReadingComment, ReadingValue } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { emptyStringOr } from '@/components/form/utils/form-schema.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useTRPC } from '@/lib/trpc.js';
import { AssignmentEditorDialog } from './AssignmentEditDialog.js';
import { ReadingCaptureCard, ReadingCaptureDetails, ReadingValueField } from './ReadingCaptureFields.js';
import { useReadingCapture } from './use-reading-capture.js';

const ArrivalValues = z.object({
  value: ReadingValue,
  comment: z.union([z.string().trim().length(0), ReadingComment]),
  confirmedDispute: z.object({ value: ReadingValue, previousId: UUID }).nullable(),
  changeAssignment: z.boolean(),
  implementId: emptyStringOr(UUID),
  driverUserId: emptyStringOr(AuthId),
});

export function ArrivalCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const trpc = useTRPC();
  const capture = useReadingCapture();
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [readingFocused, setReadingFocused] = useState(false);
  const history = useQuery(
    trpc.contractingReadings.fieldHistory.queryOptions({ machineId: stint?.machineId ?? '' }, { enabled: !!stint }),
  );
  const implementsQuery = useQuery(trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: !!stint }));
  const driversQuery = useQuery(trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled: !!stint }));
  const latest = history.data?.[0];
  const canCapture = (values: z.infer<typeof ArrivalValues>) =>
    history.isSuccess &&
    (!values.changeAssignment || (implementsQuery.isSuccess && driversQuery.isSuccess)) &&
    (!latest ||
      values.value >= latest.value ||
      (values.confirmedDispute?.value === values.value && values.confirmedDispute.previousId === latest.id));
  const implementOptions = [
    { value: '', label: 'No implement' },
    ...(implementsQuery.data ?? [])
      .filter((entry) => !entry.onSiteJobNumber || entry.id === stint?.implementId)
      .map((entry) => ({
        value: entry.id,
        label: entry.code,
        icon: <CategoryIcon icon={entry.categoryIcon} colour={entry.categoryColour} size={14} />,
      })),
  ];
  if (stint?.implementId && stint.implementCode && !implementOptions.some((entry) => entry.value === stint.implementId))
    implementOptions.push({ value: stint.implementId, label: stint.implementCode });
  const driverOptions = [
    { value: '', label: 'No driver' },
    ...(driversQuery.data ?? []).map((entry) => ({ value: entry.id, label: entry.name })),
  ];
  if (stint?.driverUserId && stint.driverName && !driverOptions.some((entry) => entry.value === stint.driverUserId))
    driverOptions.push({ value: stint.driverUserId, label: stint.driverName });

  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) {
          setError('');
          setPhoto(null);
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
        changeAssignment: false,
        implementId: stint?.implementId ?? '',
        driverUserId: stint?.driverUserId ?? '',
      }}
      validator={ArrivalValues}
      canSubmit={canCapture}
      disableSubmitWhenInvalid
      onBeforeCreate={canCapture}
      onCreate={async (values) => {
        if (!stint) throw new Error('No Machine Assignment selected.');
        setError('');
        try {
          await capture(
            {
              machineId: stint.machineId,
              assignmentId: stint.id,
              role: 'arrival',
              value: values.value,
              capturedAt: new Date().toISOString(),
              comment: values.comment.trim() || null,
              disputePrevious:
                !!latest &&
                values.value < latest.value &&
                values.confirmedDispute?.value === values.value &&
                values.confirmedDispute.previousId === latest.id,
              expectedPreviousId: latest?.id ?? null,
              stintOverrides: values.changeAssignment
                ? { implementId: values.implementId || null, driverUserId: values.driverUserId || null }
                : undefined,
            },
            photo,
            'Unable to capture arrival reading.',
          );
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Unable to capture arrival reading.');
          throw cause;
        }
        toast.success('Arrival reading captured');
        return true;
      }}
      onCreated={() => {
        setPhoto(null);
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
                  !readingFocused && latest && value < latest.value ? (
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
              const implement = implementsQuery.data?.find((entry) => entry.id === implementId);
              const implementLabel =
                implementOptions.find((entry) => entry.value === implementId)?.label ?? 'No implement';
              const driverLabel = driverOptions.find((entry) => entry.value === driverUserId)?.label ?? 'No driver';
              return (
                <Card className="bg-muted/30" size="sm">
                  <CardHeader>
                    <CardTitle>Starting assignment</CardTitle>
                    <CardAction>
                      {stint ? (
                        <AssignmentEditorDialog
                          stint={{ ...stint, implementId: implementId || null, driverUserId: driverUserId || null }}
                          implementOptions={implementOptions}
                          driverOptions={driverOptions}
                          canSave={implementsQuery.isSuccess && driversQuery.isSuccess}
                          error={implementsQuery.error ?? driversQuery.error}
                          submitLabel="Apply"
                          onSave={async (draft) => {
                            form.setFieldValue('implementId', draft.implementId);
                            form.setFieldValue('driverUserId', draft.driverUserId);
                            form.setFieldValue(
                              'changeAssignment',
                              draft.implementId !== (stint.implementId ?? '') ||
                                draft.driverUserId !== (stint.driverUserId ?? ''),
                            );
                          }}
                        />
                      ) : null}
                    </CardAction>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                    <div className="min-w-0 space-y-2">
                      <span className="block text-xs text-muted-foreground">Implement</span>
                      <span className="flex min-h-6 items-center gap-2">
                        {implement ? (
                          <CategoryIcon icon={implement.categoryIcon} colour={implement.categoryColour} size={14} />
                        ) : null}
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
          <ReadingCaptureDetails
            id={`arrival-photo-${stint?.id ?? 'closed'}`}
            photo={photo}
            onPhotoChange={setPhoto}
            error={error}
            onError={setError}
          >
            <form.AppField name="comment">
              {(field) => <field.TextareaField label="Comment (optional)" />}
            </form.AppField>
          </ReadingCaptureDetails>
        </>
      )}
    </CreateEntityDialog>
  );
}

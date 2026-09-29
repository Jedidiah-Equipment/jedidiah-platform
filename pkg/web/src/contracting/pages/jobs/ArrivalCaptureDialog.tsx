import { formatHours } from '@pkg/domain';
import { AuthId, UUID } from '@pkg/schema';
import { type Assignment, ReadingComment, ReadingValue } from '@pkg/schema/contracting';
import { IconArrowRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { emptyStringOr } from '@/components/form/utils/form-schema.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { useTRPC } from '@/lib/trpc.js';
import { ReadingPhotoPicker } from './ReadingPhotoPicker.js';
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
      title={`Capture arrival · ${stint?.machineCode ?? ''}`}
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
          {history.isPending ? <p className="text-muted-foreground">Loading the previous reading…</p> : null}
          <div className="mt-2 space-y-3">
            <div className="grid grid-cols-[minmax(6rem,0.85fr)_1.25rem_minmax(0,1.3fr)] items-end gap-2">
              <div className="min-w-0 space-y-2">
                <span className="block text-xs font-medium">Previous reading</span>
                <span className="flex h-8 items-center text-lg font-semibold">
                  {history.isSuccess ? (latest ? formatHours(latest.value) : 'None') : '—'}
                </span>
              </div>
              <IconArrowRight aria-hidden="true" className="mb-1.5 size-5 text-muted-foreground" />
              <div onFocusCapture={() => setReadingFocused(true)} onBlurCapture={() => setReadingFocused(false)}>
                <form.AppField name="value">
                  {(field) => (
                    <field.NumberField
                      label={<span className="text-xs">Current reading</span>}
                      decimals={1}
                      min={0}
                      className="text-lg font-semibold md:text-lg"
                      onInput={() => form.setFieldValue('confirmedDispute', null)}
                    />
                  )}
                </form.AppField>
              </div>
            </div>
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
          </div>
          <form.Subscribe selector={(state) => state.values.changeAssignment}>
            {(changing) => (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    Starting with {stint?.implementCode ?? 'no implement'} · {stint?.driverName ?? 'no driver'}
                  </span>
                  <Button
                    onClick={() => form.setFieldValue('changeAssignment', !changing)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {changing ? 'Keep planned assignment' : 'Change assignment'}
                  </Button>
                </div>
                {changing ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <form.AppField name="implementId">
                      {(field) => <field.ComboboxField label="Implement" options={implementOptions} />}
                    </form.AppField>
                    <form.AppField name="driverUserId">
                      {(field) => <field.ComboboxField label="Driver" options={driverOptions} />}
                    </form.AppField>
                    <ErrorMessage
                      error={implementsQuery.error ?? driversQuery.error}
                      fallbackMessage="Unable to load Implement and Driver options."
                    />
                  </div>
                ) : null}
              </div>
            )}
          </form.Subscribe>
          <ReadingPhotoPicker
            id={`arrival-photo-${stint?.id ?? 'closed'}`}
            photo={photo}
            onChange={setPhoto}
            onError={setError}
          />
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          <form.AppField name="comment">{(field) => <field.TextareaField label="Comment (optional)" />}</form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}

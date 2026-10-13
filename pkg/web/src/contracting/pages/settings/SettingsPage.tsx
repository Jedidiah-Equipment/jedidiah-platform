import type { ContractingSettings } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useAppForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardFooter } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { SettingsFormValues, settingsFormToInput, settingsFormValues } from './types.js';

export function SettingsPage() {
  return (
    <PageLayout title="Settings" description="Thresholds and targets that every Contracting screen reads." size="md">
      <SettingsContent />
    </PageLayout>
  );
}

function SettingsContent() {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingSettings.get.queryOptions());
  if (query.isPending) return <Skeleton className="h-64 w-full" />;
  if (query.error) return <ErrorMessage error={query.error} fallbackMessage="Unable to load Settings." />;
  return <SettingsForm settings={query.data} />;
}

/** Explicit Save, never autosave: a half-typed threshold must not flip Gap Flags mid-keystroke. */
function SettingsForm({ settings }: { settings: ContractingSettings }) {
  const trpc = useTRPC();
  const { invalidateSettings } = useQueryInvalidation();
  const save = useMutation(trpc.contractingSettings.update.mutationOptions({ onSuccess: invalidateSettings }));
  const form = useAppForm({
    defaultValues: settingsFormValues(settings),
    validators: { onSubmit: SettingsFormValues },
    onSubmit: async ({ value, formApi }) => {
      try {
        const saved = await save.mutateAsync(settingsFormToInput(value));
        formApi.reset(settingsFormValues(saved));
      } catch {
        // The mutation error stays visible under the form so the draft can be corrected and retried.
      }
    },
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Card>
        <CardContent>
          <fieldset disabled={save.isPending} className="grid gap-6">
            <form.AppField name="gapFlagThresholdHours">
              {(field) => (
                <field.NumberField
                  label="Gap Flag threshold (hours)"
                  unit="hours"
                  decimals={1}
                  description="An Hour Gap longer than this is flagged at sign-off. Applies to every open gap at once; resolved gaps keep their split."
                />
              )}
            </form.AppField>
            <form.AppField name="serviceDueSoonThresholdHours">
              {(field) => (
                <field.NumberField
                  label="Service Due Soon threshold (hours)"
                  unit="hours"
                  decimals={0}
                  inputMode="numeric"
                  description="A Machine is Service Due Soon within this many hours of its Next Service Due. Alerts fire at the next capture that brings a Machine inside the threshold."
                />
              )}
            </form.AppField>
            <form.AppField name="utilisationTargetPercent">
              {(field) => (
                <field.NumberField
                  label="Utilisation Target (%)"
                  unit="%"
                  decimals={0}
                  inputMode="numeric"
                  placeholder="No line"
                  description="Drawn as the reference line on the Utilisation report. Leave empty to draw no line."
                />
              )}
            </form.AppField>
          </fieldset>
          <ErrorMessage className="mt-4" error={save.error} fallbackMessage="Unable to save Settings." />
        </CardContent>
        <form.Subscribe
          selector={(state) => ({ isDefaultValue: state.isDefaultValue, isSubmitting: state.isSubmitting })}
        >
          {({ isDefaultValue, isSubmitting }) => (
            <CardFooter className="justify-end">
              <Button type="submit" disabled={isDefaultValue || isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </CardFooter>
          )}
        </form.Subscribe>
      </Card>
    </form>
  );
}

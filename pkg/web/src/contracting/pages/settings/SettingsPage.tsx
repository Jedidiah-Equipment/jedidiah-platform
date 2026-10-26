import type { ContractingSettings, JohnDeereConnectResult } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useSaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Card, CardContent, CardFooter } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { JohnDeereTab } from './JohnDeereTab.js';
import { SettingsTab } from './settings-tabs.js';
import { SettingsFormValues, settingsFormToInput, settingsFormValues } from './types.js';

type SettingsPageProps = {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  result: JohnDeereConnectResult | undefined;
  onResultShown: () => void;
};

export function SettingsPage({ tab, onTabChange, result, onResultShown }: SettingsPageProps) {
  return (
    <PageLayout
      title="Settings"
      description="Thresholds and targets that every Contracting screen reads, and the John Deere Connection."
      size="md"
    >
      <Tabs className="w-full" onValueChange={(value) => onTabChange(SettingsTab.parse(value))} size="sm" value={tab}>
        <TabsList variant="default">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="john-deere">John Deere</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="general">
          <SettingsContent />
        </TabsContent>
        <TabsContent className="pt-4" value="john-deere">
          <JohnDeereTab result={result} onResultShown={onResultShown} />
        </TabsContent>
      </Tabs>
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
  const { form, onFormSubmit } = useSaveForm({
    defaultValues: settingsFormValues(settings),
    schema: SettingsFormValues,
    save: save.mutateAsync,
    toInput: settingsFormToInput,
    fromSaved: settingsFormValues,
  });
  return (
    <form.AppForm>
      <form onSubmit={onFormSubmit}>
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
                    description="A Machine is Service Due Soon within this many hours of its Next Service Due, unless the Machine sets its own Service alert hours. Alerts fire at the next capture that brings a Machine inside the threshold."
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
          <CardFooter className="justify-end">
            <form.SaveButton />
          </CardFooter>
        </Card>
      </form>
    </form.AppForm>
  );
}

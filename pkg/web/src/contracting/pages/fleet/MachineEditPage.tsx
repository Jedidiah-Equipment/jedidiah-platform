import { formatNumber } from '@pkg/domain';
import { opensWebJobs, readingProviderSuffix } from '@pkg/domain/contracting';
import type { Machine } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { QueryContent } from '@/components/common/QueryContent.js';
import { withCurrentOption } from '@/components/common/SearchableCombobox.js';
import { AutosaveFormCard, AutosaveFormFields } from '@/components/form/AutosaveFormCard.js';
import { ReadOnlyField } from '@/components/form/fields/ReadOnlyField.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { DetailAsideGrid } from '@/components/page-layout/DetailAsideGrid.js';
import { EditFormFullWidth } from '@/components/page-layout/EditFormLayout.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { machineDialogSubject } from '@/contracting/components/MachineDialogTitle.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { JobsTable } from '@/contracting/pages/jobs/JobsPage.js';
import { ServicesTable } from '@/contracting/pages/services/ServicesPage.js';
import { WorkshopTable } from '@/contracting/pages/workshop/WorkshopPage.js';
import { useAccess, useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { CategoryPickerField } from './CategoryFields.js';
import { FleetHistoryCard } from './FleetHistoryCard.js';
import { FleetRetirement } from './FleetRetirement.js';
import { MachineJohnDeereField } from './MachineJohnDeereField.js';
import { MachineServiceCard } from './MachineServiceCard.js';
import { MachineEditTab, type MachineTabAccess, resolveMachineEditTab } from './machine-edit-tabs.js';
import { MachineFormValues, machineFormValues, machinePatchInput } from './types.js';

export function MachineEditPage({
  id,
  tab,
  onTabChange,
}: {
  id: string;
  tab: MachineEditTab;
  onTabChange: (tab: MachineEditTab) => void;
}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingFleet.machines.get.queryOptions({ id }));
  return (
    <PageLayout
      title={
        query.data ? (
          <CategoryLabel
            icon={query.data.categoryIcon}
            colour={query.data.categoryColour}
            name={query.data.code}
            size={24}
          />
        ) : (
          'Machine'
        )
      }
      description={query.data ? `${query.data.categoryName} · Machine details` : 'Machine details'}
    >
      <QueryContent query={query} errorMessage="Unable to load machine.">
        {(machine) => <MachineForm key={id} machine={machine} tab={tab} onTabChange={onTabChange} />}
      </QueryContent>
    </PageLayout>
  );
}
function MachineForm({
  machine,
  tab,
  onTabChange,
}: {
  machine: Machine;
  tab: MachineEditTab;
  onTabChange: (tab: MachineEditTab) => void;
}) {
  const trpc = useTRPC();
  const { invalidateFleet } = useQueryInvalidation();
  const canEdit = useCan('contracting_machine:update').can && !machine.retiredAt;
  const access: MachineTabAccess = {
    jobs: opensWebJobs(useAccess().data),
    workshop: useCan('contracting_breakdown:read').can,
    service: useCan('contracting_service:read').can,
  };
  const activeTab = resolveMachineEditTab(tab, access);
  const linkedTabs = [
    { value: 'jobs', label: 'Jobs', content: <JobsTable scope={{ kind: 'machine', id: machine.id }} /> },
    { value: 'workshop', label: 'Workshop', content: <WorkshopTable machineId={machine.id} /> },
    { value: 'service', label: 'Services', content: <ServicesTable machineId={machine.id} /> },
  ] as const satisfies readonly { value: keyof MachineTabAccess; label: string; content: ReactNode }[];
  const openTabs = linkedTabs.filter(({ value }) => access[value]);
  const categories = useQuery(trpc.contractingFleet.categories.list.queryOptions({ kind: 'machine' }));
  const options = useQuery(trpc.contractingFleet.machines.options.queryOptions());
  const patch = useMutation(trpc.contractingFleet.machines.patch.mutationOptions({ onSuccess: invalidateFleet }));
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: machineFormValues(machine),
    failureMessage: 'Unable to update machine.',
    validator: MachineFormValues,
    toInput: (value) => machinePatchInput(machine.id, value),
    save: (value) => patch.mutateAsync(value),
  });
  const driverOptions = withCurrentOption(
    (options.data?.drivers ?? []).map((row) => ({ label: row.name, value: row.id })),
    machine.currentDriverUserId,
    machine.currentDriverName ?? 'Unavailable driver',
  );
  return (
    <>
      <ErrorMessage error={categories.error ?? options.error} fallbackMessage="Unable to load fleet options." />
      {machine.retiredAt ? <p className="mb-4 text-muted-foreground">Retired — {machine.retiredReason}</p> : null}
      <Tabs
        className="w-full"
        onValueChange={(value) => onTabChange(MachineEditTab.parse(value))}
        size="sm"
        value={activeTab}
      >
        <TabsList variant="default">
          <TabsTrigger value="details">Details</TabsTrigger>
          {openTabs.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent className="pt-4" value="details" keepMounted>
          <DetailAsideGrid>
            <div className="min-w-0 space-y-5">
              <AutosaveFormCard formProps={formProps} autosave={autosave} disabled={!canEdit}>
                <form.AppField name="code">{(field) => <field.TextField label="Code" />}</form.AppField>
                <form.AppField name="categoryId">
                  {() => (
                    <CategoryPickerField
                      disabled={!canEdit}
                      categories={categories.data ?? []}
                      onValueCommit={autosave.commit}
                    />
                  )}
                </form.AppField>
                <form.AppField name="make">
                  {(field) => (
                    <field.CreatableComboboxField
                      label="Make"
                      disabled={!canEdit}
                      options={options.data?.makes ?? []}
                    />
                  )}
                </form.AppField>
                <form.AppField name="model">
                  {(field) => (
                    <field.CreatableComboboxField
                      label="Model"
                      disabled={!canEdit}
                      options={options.data?.models ?? []}
                    />
                  )}
                </form.AppField>
                <form.AppField name="year">{(field) => <field.NumberField label="Year" />}</form.AppField>
                <form.AppField name="registration">{(field) => <field.TextField label="Registration" />}</form.AppField>
                <ReadOnlyField label="Serial number" value={machine.serialNumber} />
                <MachineJohnDeereField machine={machine} />
                <form.AppField name="currentDriverUserId">
                  {(field) => (
                    <field.ComboboxField
                      label="Current driver"
                      disabled={!canEdit}
                      placeholder="Search drivers..."
                      emptyMessage="No drivers found."
                      options={[{ label: 'No driver', value: '' }, ...driverOptions]}
                      onValueCommit={autosave.commit}
                    />
                  )}
                </form.AppField>
                <EditFormFullWidth>
                  <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
                </EditFormFullWidth>
              </AutosaveFormCard>
              <MachineServiceCard machine={machine}>
                <AutosaveFormFields formProps={formProps} disabled={!canEdit}>
                  <ReadOnlyField
                    label={`Current hours${readingProviderSuffix(machine.latestReadingProvider)}`}
                    unit="hours"
                    value={
                      machine.latestReadingHours === null
                        ? null
                        : formatNumber(machine.latestReadingHours, { decimals: 1 })
                    }
                  />
                  <form.AppField name="serviceIntervalHours">
                    {(field) => <field.NumberField label="Service interval" unit="hours" />}
                  </form.AppField>
                  <form.AppField name="nextServiceDueHours">
                    {(field) => <field.NumberField label="Next service due" unit="hours" />}
                  </form.AppField>
                  <form.AppField name="serviceAlertHours">
                    {(field) => (
                      <field.NumberField
                        label="Service alert hours"
                        unit="hours"
                        decimals={0}
                        inputMode="numeric"
                        placeholder={
                          machine.serviceAlertHours === null
                            ? formatNumber(machine.effectiveServiceAlertHours)
                            : undefined
                        }
                        description="Service due soon this many hours before the next service. Leave blank to use Settings."
                      />
                    )}
                  </form.AppField>
                </AutosaveFormFields>
              </MachineServiceCard>
              {canEdit ? (
                <FleetRetirement
                  machine={machineDialogSubject(machine)}
                  id={machine.id}
                  noun="machine"
                  autosave={autosave}
                  retire={trpc.contractingFleet.machines.retire.mutationOptions()}
                  remove={trpc.contractingFleet.machines.remove.mutationOptions()}
                />
              ) : null}
            </div>
            <FleetHistoryCard subject={{ machineId: machine.id }} onOpenService={() => onTabChange('service')} />
          </DetailAsideGrid>
        </TabsContent>
        {openTabs.map(({ value, content }) => (
          <TabsContent className="pt-4" key={value} value={value}>
            {content}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

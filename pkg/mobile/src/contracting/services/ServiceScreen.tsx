import { formatDate, formatHours, getFirstName } from '@pkg/domain';
import { serviceRecordBadge } from '@pkg/domain/contracting';
import {
  type FieldMachine,
  OpenServiceValues,
  openServiceFields,
  openServiceValues,
  type ServiceRecord,
} from '@pkg/schema/contracting';
import { IconChevronRight, IconPencil } from '@tabler/icons-react-native';
import { revalidateLogic } from '@tanstack/react-form';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateText } from '@/components/DateText';
import { useAppForm } from '@/components/form';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { ScrollLockScrollView } from '@/components/scroll-lock';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Card, CardIconAction } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { RefreshControl } from '@/components/ui/refresh-control';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { DetailRow } from '@/contracting/components/DetailRow';
import { MachineKnownHours } from '@/contracting/components/MachineKnownHours';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useSessionPermission } from '@/lib/auth-session';
import { useBusyAction } from '@/lib/use-busy-action';
import { CloseServiceSheet } from './CloseServiceSheet';
import { MachineServiceCard } from './MachineServiceCard';
import { SERVICE_SAVE_FAILED, useServiceMechanicOptions, useServiceMutation, useServiceRecord } from './use-services';

/** One Service Record: editable and closable while the Machine is in the workshop, read-only once it is closed. */
export default function ServiceScreen() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const query = useServiceRecord(serviceId);
  const record = query.data;
  const badge = record ? serviceRecordBadge(record.status) : null;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Service"
        subtitle={record?.machineCode ?? 'CONTRACTING'}
        parentLabel="Services"
        onBack={() => router.navigate('/contracting/services' as Href)}
        helpTopic="contractingMobileService"
        badge={badge ? <StatusBadge classNames={badge.colours} label={badge.label} /> : undefined}
      />
      <ScrollLockScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}
        refreshControl={<RefreshControl />}
      >
        {record ? (
          <ServiceSections record={record} />
        ) : (
          <Text className="text-muted-foreground">
            {!query.canRead
              ? 'Your role cannot view Service Records.'
              : query.gone
                ? 'This service no longer exists.'
                : query.isError
                  ? 'This service could not be loaded.'
                  : 'Loading service…'}
          </Text>
        )}
      </ScrollLockScrollView>
    </SafeAreaView>
  );
}

function ServiceSections({ record }: { record: ServiceRecord }) {
  // A Machine retired since the record closed is not in the field read.
  const machine = useFleet().data?.find((row) => row.id === record.machineId);
  return (
    <>
      <MachineCard record={record} machine={machine} />
      {record.status === 'open' ? (
        <OpenRecord record={record} serviceIntervalHours={machine?.serviceIntervalHours ?? null} />
      ) : (
        <ClosedRecordCard record={record} />
      )}
    </>
  );
}

/** The Machine in for the service, opening its own screen; one not in the field read keeps its code and category. */
function MachineCard({ record, machine }: { record: ServiceRecord; machine: FieldMachine | undefined }) {
  if (!machine)
    return (
      <Card>
        <MachineIdentity record={record} title={record.machineCode} />
      </Card>
    );
  return (
    <MachineServiceCard
      machine={machine}
      header={
        <Pressable
          accessibilityHint="Opens the Machine"
          accessibilityRole="link"
          className="gap-1 active:opacity-70"
          onPress={() => router.push({ pathname: '/contracting/machines/[id]', params: { id: machine.id } })}
        >
          <MachineIdentity record={record} title={`${machine.make} ${machine.model}`}>
            <Icon className="text-muted-foreground" icon={IconChevronRight} size={16} />
          </MachineIdentity>
          <MachineKnownHours machine={machine} />
        </Pressable>
      }
    />
  );
}

function MachineIdentity({ record, title, children }: { record: ServiceRecord; title: string; children?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-3">
      <CategoryIcon icon={record.categoryIcon} colour={record.categoryColour} size={24} />
      <View className="min-w-0 flex-1">
        <Text className="text-lg text-foreground" weight="bold">
          {title}
        </Text>
        <Text className="text-sm text-muted-foreground">{record.categoryName}</Text>
      </View>
      {children}
    </View>
  );
}

function OpenRecord({ record, serviceIntervalHours }: { record: ServiceRecord; serviceIntervalHours: number | null }) {
  const canUpdate = useSessionPermission('contracting_service:update');
  const [closing, setClosing] = useState(false);
  // The editor stays open until its save has refetched; the close sheet starts from the saved record, not the edits.
  const [editing, setEditing] = useState(false);
  return (
    <>
      <DetailsCard record={record} canEdit={canUpdate} editing={editing} onEditingChange={setEditing} />
      {canUpdate ? <Button primary title="Close service" disabled={editing} onPress={() => setClosing(true)} /> : null}
      {closing ? (
        <CloseServiceSheet
          record={record}
          serviceIntervalHours={serviceIntervalHours}
          onClose={() => setClosing(false)}
        />
      ) : null}
    </>
  );
}

/** Start date, Mechanic and notes, read until the pencil opens them for an explicit Save. */
function DetailsCard({
  record,
  canEdit,
  editing,
  onEditingChange,
}: {
  record: ServiceRecord;
  canEdit: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  return (
    <Card
      title="Details"
      action={
        canEdit && !editing ? (
          <CardIconAction icon={IconPencil} label="Edit details" onPress={() => onEditingChange(true)} />
        ) : null
      }
    >
      {editing ? (
        <DetailsForm record={record} onDone={() => onEditingChange(false)} />
      ) : (
        <>
          <DetailRow label="Start date">
            <Text className="text-foreground" weight="semibold">
              {formatDate(record.startDate, 'short')}
            </Text>
          </DetailRow>
          <MechanicRow record={record} />
          <NotesRow notes={record.notes} />
        </>
      )}
    </Card>
  );
}

function DetailsForm({ record, onDone }: { record: ServiceRecord; onDone: () => void }) {
  const patch = useServiceMutation((services) => services.patch);
  const mechanicOptions = useServiceMechanicOptions(record);
  const showToast = useAppToast();
  const { busy, error, run } = useBusyAction();
  const form = useAppForm({
    defaultValues: openServiceValues(record),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: OpenServiceValues },
    onSubmit: ({ value }) =>
      run(async () => {
        await patch.mutateAsync({ id: record.id, ...openServiceFields(value) });
        showToast('success', 'Saved');
        onDone();
      }, SERVICE_SAVE_FAILED),
  });
  return (
    <>
      <form.AppField name="startDate">
        {(field) => <field.DateField label="Start date" disabled={busy} />}
      </form.AppField>
      <form.AppField name="primaryMechanicUserId">
        {(field) => (
          <field.SearchSelectField
            label="Mechanic"
            placeholder="No Mechanic yet"
            searchPlaceholder="Search mechanics…"
            emptyMessage="No mechanics match."
            options={mechanicOptions}
            disabled={busy}
          />
        )}
      </form.AppField>
      <form.AppField name="notes">
        {(field) => <field.TextareaField label="Notes" rows={4} disabled={busy} />}
      </form.AppField>
      {error ? <Text className="text-danger">{error}</Text> : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button title="Cancel" disabled={busy} onPress={onDone} />
        </View>
        <View className="flex-1">
          <Button primary title={busy ? 'Saving…' : 'Save'} disabled={busy} onPress={() => void form.handleSubmit()} />
        </View>
      </View>
    </>
  );
}

/** What the closed service recorded; the server refuses writes on it, so nothing here is editable. */
function ClosedRecordCard({ record }: { record: ServiceRecord }) {
  return (
    <Card title="Service">
      <DetailRow label="Start date">
        <Text className="text-foreground" weight="semibold">
          {formatDate(record.startDate, 'short')}
        </Text>
      </DetailRow>
      <DetailRow label="End date">
        <Text className="text-foreground" weight="semibold">
          {formatDate(record.endDate, 'short')}
        </Text>
      </DetailRow>
      <DetailRow label="Reading at service">
        <Text className="text-foreground" weight="semibold">
          {record.readingAtServiceHours === null ? 'Not recorded' : formatHours(record.readingAtServiceHours)}
        </Text>
      </DetailRow>
      <MechanicRow record={record} />
      <DetailRow label="Next service due set">
        <Text className="text-foreground" weight="semibold">
          {record.nextServiceDueHoursSet === null ? 'Not set' : formatHours(record.nextServiceDueHoursSet)}
        </Text>
      </DetailRow>
      <NotesRow notes={record.notes} />
      <DetailRow label="Closed">
        <Text className="text-foreground" weight="semibold">
          <DateText className="text-foreground" weight="semibold" date={record.closedAt} format="medium" />
          {record.closedByName ? ` by ${getFirstName(record.closedByName)}` : ''}
        </Text>
      </DetailRow>
    </Card>
  );
}

function MechanicRow({ record }: { record: ServiceRecord }) {
  return (
    <DetailRow label="Mechanic">
      <Text className="text-foreground" weight="semibold">
        {record.mechanicName ? getFirstName(record.mechanicName) : 'No Mechanic yet'}
      </Text>
    </DetailRow>
  );
}

function NotesRow({ notes }: { notes: string | null }) {
  return (
    <View className="gap-1">
      <Text className="text-muted-foreground">Notes</Text>
      <Text className="text-foreground">{notes || 'No notes'}</Text>
    </View>
  );
}

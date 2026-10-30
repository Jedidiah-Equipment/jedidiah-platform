import type { FieldMachine, ServiceRecord } from '@pkg/schema/contracting';
import { IconFilter, IconUser } from '@tabler/icons-react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import {
  type ListControlOption,
  ListControlRow,
  ListCreateControl,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { infiniteQueryPagination, TabRootList } from '@/components/TabRootList';
import { Text } from '@/components/ui/text';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import { useSessionPermission } from '@/lib/auth-session';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { usePersistedState } from '@/lib/use-persisted-state';
import { BookServiceSheet } from './BookServiceSheet';
import { DueMachineRow } from './DueMachineRow';
import { ServiceRow } from './ServiceRow';
import { serviceRecordHref } from './service-routes';
import { isStatusFilter, type StatusFilter, statusesFor, statusOptions } from './service-status-filter';
import { useMachinesDueForService, useServiceFilterOptions, useServiceRecordList } from './use-services';

const STATUS_KEY = contractingStorageKey('services', 'status');
const EVERY_MECHANIC = 'all';
const LOADING_MESSAGE = 'Loading services…';

type Row =
  | { kind: 'due'; machine: FieldMachine }
  | { kind: 'record'; record: ServiceRecord }
  | { kind: 'message'; message: string };

function SectionHeader({ children }: { children: string }) {
  return (
    <Text className="text-base text-foreground" weight="bold">
      {children}
    </Text>
  );
}

/**
 * The web's Services page on the phone: the Machines Due for Service pinned above the Service Records, which no
 * search or filter hides. Scoped to one Machine it is that Machine's Service history: every status, nothing pinned
 * and nothing persisted, and booking only while the Machine is not Booked In.
 */
export function ServicesList({ scope }: { scope: { machineId: string; bookable: boolean } | null }) {
  const canBook = useSessionPermission('contracting_service:update');
  const due = useMachinesDueForService();
  const filterOptions = useServiceFilterOptions();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const [savedStatus, setStatus] = usePersistedState<StatusFilter>(STATUS_KEY, 'open', isStatusFilter);
  const status = scope ? 'all' : savedStatus;
  const [mechanic, setMechanic] = useState(EVERY_MECHANIC);
  const [booking, setBooking] = useState<{ machineId: string | null } | null>(null);
  const { canRead, query, records } = useServiceRecordList({
    search: debouncedSearch,
    statuses: statusesFor(status),
    mechanicUserIds: mechanic === EVERY_MECHANIC ? [] : [mechanic],
    machineIds: scope ? [scope.machineId] : [],
  });
  const pinned = scope ? [] : (due.data ?? []);
  const mechanicOptions: ListControlOption<string>[] = [
    { label: 'All mechanics', value: EVERY_MECHANIC },
    ...(filterOptions.data?.mechanics ?? []).map((person) => ({ label: person.name, value: person.id })),
  ];
  const filtered = search !== '' || (!scope && status !== 'open') || mechanic !== EVERY_MECHANIC;
  const emptyMessage = !canRead
    ? 'Your role cannot view Service Records.'
    : query.isError
      ? 'Unable to load Service Records. Pull to retry.'
      : filtered
        ? 'No services match your search or filters.'
        : scope
          ? 'This Machine has no services yet.'
          : 'Nothing is booked in.';
  const initialLoading = canRead && query.isPending;
  const recordRows: Row[] = records.length
    ? records.map((record) => ({ kind: 'record', record }))
    : // Under pinned rows the list is not empty, so the records say why they are missing themselves.
      pinned.length
      ? [{ kind: 'message', message: initialLoading ? LOADING_MESSAGE : emptyMessage }]
      : [];
  const canBookHere = canBook && (scope?.bookable ?? true);
  return (
    <>
      <TabRootList<Row>
        header={
          <View className="gap-2.5">
            <ListControlRow
              leading={
                <ListSearchControl
                  accessibilityLabel="Search services"
                  onChangeText={setSearch}
                  placeholder="Search by machine or mechanic…"
                  value={search}
                />
              }
              trailing={
                <View className="flex-row items-center gap-2">
                  {scope ? null : (
                    <ListDropdownControl
                      accessibilityLabel="Filter services by status"
                      defaultValue="open"
                      dismissLabel="Dismiss service status filter"
                      icon={IconFilter}
                      menuWidth={200}
                      onChange={setStatus}
                      options={statusOptions}
                      value={status}
                    />
                  )}
                  {filterOptions.data ? (
                    <ListDropdownControl
                      accessibilityLabel="Filter services by Mechanic"
                      defaultValue={EVERY_MECHANIC}
                      dismissLabel="Dismiss Mechanic filter"
                      icon={IconUser}
                      menuWidth={240}
                      onChange={setMechanic}
                      options={mechanicOptions}
                      value={mechanic}
                    />
                  ) : null}
                  {canBookHere ? (
                    <ListCreateControl
                      label="Book a service"
                      onPress={() => setBooking({ machineId: scope?.machineId ?? null })}
                    />
                  ) : null}
                </View>
              }
            />
            {!scope && due.isError && !due.data ? (
              <Text className="text-sm text-muted-foreground">The Machines due could not be loaded.</Text>
            ) : null}
          </View>
        }
        sections={[
          {
            key: 'due',
            header: <SectionHeader>Due for a service</SectionHeader>,
            data: pinned.map((machine) => ({ kind: 'due', machine })),
          },
          { key: 'records', header: scope ? undefined : <SectionHeader>Services</SectionHeader>, data: recordRows },
        ]}
        keyOf={(row) => (row.kind === 'due' ? row.machine.id : row.kind === 'record' ? row.record.id : row.kind)}
        pagination={infiniteQueryPagination(query, 'Loading more services…')}
        renderItem={(row) =>
          row.kind === 'due' ? (
            <DueMachineRow
              machine={row.machine}
              onBook={canBook ? () => setBooking({ machineId: row.machine.id }) : undefined}
            />
          ) : row.kind === 'record' ? (
            <ServiceRow record={row.record} />
          ) : (
            <Text className="text-muted-foreground">{row.message}</Text>
          )
        }
        initialLoading={initialLoading}
        loadingContent={<Text className="text-muted-foreground">{LOADING_MESSAGE}</Text>}
        emptyContent={<Text className="text-muted-foreground">{emptyMessage}</Text>}
        underSecondaryToolbar={scope !== null}
      />
      {booking ? (
        <BookServiceSheet
          machineId={booking.machineId}
          onBooked={(record) => router.push(serviceRecordHref(record.id))}
          onClose={() => setBooking(null)}
        />
      ) : null}
    </>
  );
}

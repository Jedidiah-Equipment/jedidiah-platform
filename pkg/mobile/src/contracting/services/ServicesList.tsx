import type { FieldMachine, ServiceRecord, ServiceRecordStatus } from '@pkg/schema/contracting';
import { IconUser } from '@tabler/icons-react-native';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
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
import { useSessionPermission } from '@/lib/auth-session';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { BookServiceSheet } from './BookServiceSheet';
import { DueMachineRow } from './DueMachineRow';
import { ServiceRow } from './ServiceRow';
import { serviceRecordHref } from './service-routes';
import { useServiceFilterOptions, useServiceRecordList } from './use-services';

const EVERY_MECHANIC = 'all';
const LOADING_MESSAGE = 'Loading services…';

type Row = { kind: 'due'; machine: FieldMachine } | { kind: 'record'; record: ServiceRecord };

function SectionHeader({ children }: { children: string }) {
  return (
    <Text className="text-base text-foreground" weight="bold">
      {children}
    </Text>
  );
}

/**
 * Service Records newest start first, searched and filtered by Mechanic here; the screen decides the rest. The
 * Services tab pins the Machines Due for Service above them, which no search or filter hides.
 */
export function ServicesList({
  statuses,
  statusControl,
  machineIds = [],
  due,
  book,
  emptyMessage,
  underSecondaryToolbar = false,
}: {
  statuses: readonly ServiceRecordStatus[];
  statusControl?: ReactNode;
  machineIds?: readonly string[];
  /** The Machines Due for Service, pinned above the records with a Book button each. */
  due?: { machines: readonly FieldMachine[]; failed: boolean };
  /** Where the list's Book a service books: its Machine, or null to pick one. No button without it. */
  book?: { machineId: string | null };
  /** What the list says with no records before any search or Mechanic filter. */
  emptyMessage: string;
  underSecondaryToolbar?: boolean;
}) {
  const canBook = useSessionPermission('contracting_service:update');
  const filterOptions = useServiceFilterOptions();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const [mechanic, setMechanic] = useState(EVERY_MECHANIC);
  const [booking, setBooking] = useState<{ machineId: string | null } | null>(null);
  const { canRead, query, records } = useServiceRecordList({
    search: debouncedSearch,
    statuses,
    mechanicUserIds: mechanic === EVERY_MECHANIC ? [] : [mechanic],
    machineIds,
  });
  const mechanicOptions: ListControlOption<string>[] = [
    { label: 'All mechanics', value: EVERY_MECHANIC },
    ...(filterOptions.data?.mechanics ?? []).map((person) => ({ label: person.name, value: person.id })),
  ];
  const message = !canRead
    ? 'Your role cannot view Service Records.'
    : query.isError
      ? 'Unable to load Service Records. Pull to retry.'
      : search !== '' || mechanic !== EVERY_MECHANIC
        ? 'No services match your search or filters.'
        : emptyMessage;
  const initialLoading = canRead && query.isPending;
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
                  {statusControl}
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
                  {canBook && book ? (
                    <ListCreateControl label="Book a service" onPress={() => setBooking(book)} />
                  ) : null}
                </View>
              }
            />
            {due?.failed ? (
              <Text className="text-sm text-muted-foreground">The Machines due could not be loaded.</Text>
            ) : null}
          </View>
        }
        sections={[
          {
            key: 'due',
            header: <SectionHeader>Due for a service</SectionHeader>,
            data: (due?.machines ?? []).map((machine) => ({ kind: 'due', machine })),
          },
          {
            key: 'records',
            header: due ? <SectionHeader>Services</SectionHeader> : undefined,
            data: records.map((record) => ({ kind: 'record', record })),
            empty: <Text className="text-muted-foreground">{initialLoading ? LOADING_MESSAGE : message}</Text>,
          },
        ]}
        keyOf={(row) => (row.kind === 'due' ? row.machine.id : row.record.id)}
        pagination={infiniteQueryPagination(query, 'Loading more services…')}
        renderItem={(row) =>
          row.kind === 'due' ? (
            <DueMachineRow
              machine={row.machine}
              onBook={canBook ? () => setBooking({ machineId: row.machine.id }) : undefined}
            />
          ) : (
            <ServiceRow record={row.record} />
          )
        }
        initialLoading={initialLoading}
        loadingContent={<Text className="text-muted-foreground">{LOADING_MESSAGE}</Text>}
        emptyContent={<Text className="text-muted-foreground">{message}</Text>}
        underSecondaryToolbar={underSecondaryToolbar}
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

import { IconFilter } from '@tabler/icons-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListDropdownControl } from '@/components/ListControls';
import { MainToolbar } from '@/components/TopToolbar';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import { usePersistedState } from '@/lib/use-persisted-state';
import { ServicesList } from './ServicesList';
import { isStatusFilter, type StatusFilter, statusesFor, statusOptions } from './service-status-filter';
import { useMachinesDueForService } from './use-services';

const STATUS_KEY = contractingStorageKey('services', 'status');

/** The web's Services page on the phone: the Machines Due for Service pinned above the Service Records. */
export default function ServicesScreen() {
  const due = useMachinesDueForService();
  const [status, setStatus] = usePersistedState<StatusFilter>(STATUS_KEY, 'open', isStatusFilter);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Services" subtitle="CONTRACTING" helpTopic="contractingMobileServices" />
      <ServicesList
        statuses={statusesFor(status)}
        statusControl={
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
        }
        due={{ machines: due.data ?? [], failed: due.isError && !due.data }}
        book={{ machineId: null }}
        emptyMessage={status === 'open' ? 'Nothing is booked in.' : 'No services match your search or filters.'}
      />
    </SafeAreaView>
  );
}

import { serviceRecordStatuses } from '@pkg/schema/contracting';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { useFleet } from '@/contracting/readings/use-fleet';
import { ServicesList } from './ServicesList';

/**
 * One Machine's Service history, the counterpart of the web Machine page's Services tab: every status, nothing pinned
 * or persisted, and booking only while the Machine is not Booked In.
 */
export default function MachineServicesScreen() {
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const machine = useFleet().data?.find((row) => row.id === machineId);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Service history"
        subtitle={machine?.code ?? 'CONTRACTING'}
        parentLabel="Machine"
        onBack={() => router.navigate({ pathname: '/contracting/machines/[id]', params: { id: machineId } })}
        helpTopic="contractingMobileServices"
      />
      <ServicesList
        statuses={serviceRecordStatuses}
        machineIds={[machineId]}
        book={machine?.bookedInServiceId === null ? { machineId } : undefined}
        emptyMessage="This Machine has no services yet."
        underSecondaryToolbar
      />
    </SafeAreaView>
  );
}

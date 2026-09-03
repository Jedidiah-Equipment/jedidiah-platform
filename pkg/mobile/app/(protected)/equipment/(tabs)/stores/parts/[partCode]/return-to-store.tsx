import { useLocalSearchParams, useRouter } from 'expo-router';

import { JobMovementScreen } from '@/equipment/components/stores/JobMovementScreen';
import { resolveStoresMovementParent } from '@/equipment/lib/toolbar-navigation';

export default function StoresReturnToStoreRoute() {
  // `jobId` arrives only from the close-out screen, which already knows the Job the leftovers
  // belong to; a return reached from a scan asks for it as usual.
  const { jobId, partCode } = useLocalSearchParams<{ jobId?: string; partCode: string }>();
  const router = useRouter();
  const parent = resolveStoresMovementParent({ jobId, partCode });

  return (
    <JobMovementScreen
      jobId={jobId}
      movementType="return-to-store"
      parent={{ label: parent.label, onBack: () => router.dismissTo(parent.returnTo) }}
      partCode={partCode}
    />
  );
}

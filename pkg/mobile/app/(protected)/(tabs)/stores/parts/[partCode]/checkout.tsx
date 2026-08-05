import { useLocalSearchParams } from 'expo-router';

import { JobMovementScreen } from '@/components/stores/JobMovementScreen';

export default function StoresCheckoutRoute() {
  const { partCode } = useLocalSearchParams<{ partCode: string }>();

  return <JobMovementScreen movementType="checkout" partCode={partCode} />;
}

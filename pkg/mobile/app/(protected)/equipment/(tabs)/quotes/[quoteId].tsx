import { useLocalSearchParams } from 'expo-router';

import { QuoteDetailsScreen } from '@/equipment/components/quotes/QuoteDetailsScreen';

export default function QuoteDetailRoute() {
  const { quoteId } = useLocalSearchParams<{ quoteId: string }>();

  return <QuoteDetailsScreen quoteId={quoteId} />;
}

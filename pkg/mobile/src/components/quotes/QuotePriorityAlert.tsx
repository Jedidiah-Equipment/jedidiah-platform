import { formatDate } from '@pkg/domain';
import type { PriorityQuote } from '@pkg/schema';
import { IconAlertTriangle } from '@tabler/icons-react-native';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function QuotePriorityAlert({ quote }: { quote: PriorityQuote }) {
  const deliveryCopy = describeDeliveryDates(quote);
  const date = formatDate(quote.earliestDeliveryDate, 'd MMM yyyy');
  const title = quote.kind === 'custom' ? 'Accepted custom quote' : 'Needs job';
  const message =
    quote.kind === 'custom'
      ? `This custom quote is accepted and not linked to a Job. ${deliveryCopy} Keep the delivery commitment visible for ${date}.`
      : `This quote is accepted but no Job has been started. ${deliveryCopy} The ${quote.product?.name ?? 'product'} takes ${quote.product?.buildTimeDays ?? 0} working days to build, so start a Job soon to reserve Bay capacity in time for ${date}.`;

  return (
    <View className="flex-row gap-3 rounded-2xl border border-primary/35 bg-primary/10 p-4">
      <Icon className="mt-0.5 text-primary" icon={IconAlertTriangle} size={19} />
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-foreground" weight="bold">
          {title}
        </Text>
        <Text className="mt-1 text-xs leading-5 text-muted-foreground">{message}</Text>
      </View>
    </View>
  );
}

function describeDeliveryDates(quote: PriorityQuote): string {
  const preferred = quote.preferredDeliveryDate ? formatDate(quote.preferredDeliveryDate, 'd MMM yyyy') : null;
  const planned = quote.plannedDeliveryDate ? formatDate(quote.plannedDeliveryDate, 'd MMM yyyy') : null;
  if (preferred && planned)
    return `The customer prefers delivery by ${preferred}, and delivery is planned for ${planned}.`;
  if (preferred) return `The customer prefers delivery by ${preferred}.`;
  return planned ? `Delivery is planned for ${planned}.` : '';
}

import type { QuoteKind } from '@pkg/schema';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { CustomerName } from '@/equipment/components/CustomerName';
import { OfferingAvatar } from '@/equipment/components/OfferingAvatar';

export type JobWorkCardProps = {
  customerCompanyName: string | null;
  jobDisplayName: string;
  offeringKind: QuoteKind;
  productSerialNumber: string | null;
  productThumbnailDataUrl: string | null;
};

export function JobWorkCard({
  customerCompanyName,
  jobDisplayName,
  offeringKind,
  productSerialNumber,
  productThumbnailDataUrl,
}: JobWorkCardProps) {
  return (
    <View className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5">
      <OfferingAvatar
        className="h-[52px] w-[52px] rounded-xl"
        iconSize={26}
        kind={offeringKind}
        name={jobDisplayName}
        uri={productThumbnailDataUrl}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-base text-surface-foreground" numberOfLines={1} weight="bold">
          {jobDisplayName}
        </Text>
        {productSerialNumber ? (
          <Text className="mt-0.5 text-xs text-muted-foreground" mono>
            {productSerialNumber}
          </Text>
        ) : null}
        <View className="mt-1 flex-row">
          <CustomerName className="text-sm" companyName={customerCompanyName} numberOfLines={1} tone="surface" />
        </View>
      </View>
    </View>
  );
}

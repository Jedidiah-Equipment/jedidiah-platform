import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/ui/text';

export type JobWorkCardProps = {
  customerCompanyName: string | null;
  jobDisplayName: string;
  productSerialNumber: string | null;
  productThumbnailDataUrl: string | null;
};

export function JobWorkCard({
  customerCompanyName,
  jobDisplayName,
  productSerialNumber,
  productThumbnailDataUrl,
}: JobWorkCardProps) {
  return (
    <View className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5">
      <Avatar className="h-[52px] w-[52px] rounded-xl" name={jobDisplayName} uri={productThumbnailDataUrl} />
      <View className="min-w-0 flex-1">
        <Text className="text-base text-surface-foreground" numberOfLines={1} weight="bold">
          {jobDisplayName}
        </Text>
        {productSerialNumber ? (
          <Text className="mt-0.5 text-xs text-muted-foreground" mono>
            {productSerialNumber}
          </Text>
        ) : null}
        {customerCompanyName ? (
          <Text className="mt-1 text-sm text-surface-foreground" numberOfLines={1}>
            {customerCompanyName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

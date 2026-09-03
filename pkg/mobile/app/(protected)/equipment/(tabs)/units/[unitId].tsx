import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { SecondaryPageToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import { UnitDetail } from '@/components/units/UnitDetail';
import { useTRPC } from '@/lib/trpc';

/** Read-only Product Unit view. The units layout owns the permission gate. */
export default function UnitDetailRoute() {
  const { unitId } = useLocalSearchParams<{ unitId: string }>();
  const router = useRouter();
  const trpc = useTRPC();
  const query = useQuery(trpc.productUnits.get.queryOptions({ id: unitId }));
  const handleBack = () => router.dismissTo('/equipment/units');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryPageToolbar
        avatar={
          query.data ? (
            <Avatar
              className="h-full w-full rounded-none border-0"
              name={query.data.product.name}
              textClassName="text-[10px]"
              uri={query.data.product.thumbnailDataUrl}
            />
          ) : undefined
        }
        onBack={handleBack}
        parentLabel="Units"
        subtitle={query.isPending ? 'LOADING UNIT…' : query.isError ? 'UNIT UNAVAILABLE' : query.data.product.name}
        title={query.data?.productSerialNumber ?? 'Unit'}
      />
      {query.isPending ? (
        <RouteMessage text="Loading Unit…" />
      ) : query.isError ? (
        <RouteMessage text="Couldn’t load this Unit." />
      ) : (
        <UnitDetail unit={query.data} />
      )}
    </SafeAreaView>
  );
}

function RouteMessage({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-center text-sm text-muted-foreground">{text}</Text>
    </View>
  );
}

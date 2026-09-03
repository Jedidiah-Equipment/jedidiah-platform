import { derivePartStockActions, formatEstimatedStockOnHand } from '@pkg/domain';
import { IconArrowBackUp, IconArrowDownToArc, IconTruckReturn, IconWheel } from '@tabler/icons-react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { StoresScreen } from '@/components/stores/StoresScreen';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useStoresActor } from '@/lib/stores-actor';
import { useTRPC } from '@/lib/trpc';

/**
 * What a scan resolved to: the Part, what is on the shelf, and the four things that can be done to
 * it from the floor.
 *
 * No price appears here and none is asked for. The device session holds no `inventory_cost:read`, so
 * `partByCode` already returns nulls where the values would be (spec §11) — the screen simply has no
 * cost fields to render, rather than a gate deciding whether to show them.
 */
export default function StoresPartRoute() {
  const { partCode } = useLocalSearchParams<{ partCode: string }>();
  const router = useRouter();
  const trpc = useTRPC();
  const { actor } = useStoresActor();
  const part = useQuery(trpc.inventory.partByCode.queryOptions({ code: partCode }));

  if (part.isPending) {
    return (
      <StoresScreen
        onBack={() => router.dismissTo('/stores')}
        parentLabel="Stores"
        subtitle={partCode}
        title={partCode}
      >
        <View className="items-center py-10">
          <ActivityIndicator accessibilityLabel="Loading Part" size="large" />
        </View>
      </StoresScreen>
    );
  }

  if (part.isError) {
    return (
      <StoresScreen
        onBack={() => router.dismissTo('/stores')}
        parentLabel="Stores"
        subtitle={partCode}
        title={partCode}
      >
        <Text className="py-10 text-center text-sm text-danger">
          Couldn’t load this Part. Pull down to retry, or scan it again.
        </Text>
      </StoresScreen>
    );
  }

  const row = part.data;
  const isLinear = row.unitOfMeasure === 'mm';
  const actions = derivePartStockActions(row);

  return (
    <StoresScreen
      onBack={() => router.dismissTo('/stores')}
      parentLabel="Stores"
      subtitle={row.partCode}
      title={row.partName}
    >
      <View className="gap-3 rounded-2xl border border-border bg-surface px-4 py-4">
        <View className="flex-row items-end gap-6">
          <Figure label="ON HAND" value={`${row.quantity} ${row.unitOfMeasure}`} />
          <Figure label="FREE" value={`${row.free} ${row.unitOfMeasure}`} />
          <Figure label="COMMITTED" value={`${row.committed} ${row.unitOfMeasure}`} />
        </View>

        {row.estimatedOnHand === null ? null : (
          <View className="border-t border-border pt-3">
            <Text className="text-[11px] text-muted-foreground" mono>
              ESTIMATED ON HAND
            </Text>
            <Text className="text-sm text-surface-foreground" weight="semibold">
              {formatEstimatedStockOnHand(row.estimatedOnHand, row.unitOfMeasure)}
            </Text>
          </View>
        )}

        {isLinear ? (
          <View className="gap-2 border-t border-border pt-3">
            <Text className="text-[11px] text-muted-foreground" mono>
              LENGTHS ON THE RACK
            </Text>
            {row.buckets.map((bucket) => (
              <View className="flex-row justify-between" key={String(bucket.lengthMm)}>
                <Text className="text-sm text-surface-foreground" mono>
                  {bucket.lengthMm === null ? 'No length recorded' : `${bucket.lengthMm} mm`}
                </Text>
                <Text className="text-sm text-surface-foreground" weight="semibold">
                  {bucket.quantity}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {!actions.checkout.allowed && actions.checkout.reason === 'periodic' ? (
        <Text className="text-sm text-muted-foreground">
          This Part is counted, not tracked movement by movement, so it is not checked out to a Job.
        </Text>
      ) : null}

      {!actions.receive.allowed && actions.receive.reason === 'built-part' ? (
        <Text className="text-sm text-muted-foreground">
          This Part is made in-house and bought from nobody, so it never arrives on a Purchase Order.
        </Text>
      ) : null}

      {actor === null ? (
        <Text className="text-sm text-danger" weight="semibold">
          Choose who is at the tablet before moving any stock.
        </Text>
      ) : null}

      <View className="gap-3">
        <ActionTile
          caption="Draw this Part from stock against a Job"
          disabled={actor === null || !actions.checkout.allowed}
          icon={IconWheel}
          onPress={() => router.push({ params: { partCode }, pathname: '/stores/parts/[partCode]/checkout' })}
          title="Check out to a Job"
        />
        <ActionTile
          caption="Put leftovers back on the rack"
          disabled={actor === null || !actions.returnToStore.allowed}
          icon={IconArrowBackUp}
          onPress={() => router.push({ params: { partCode }, pathname: '/stores/parts/[partCode]/return-to-store' })}
          title="Return to store"
        />
        <ActionTile
          caption="Sign for a delivery against its Purchase Order"
          disabled={actor === null || !actions.receive.allowed}
          icon={IconArrowDownToArc}
          onPress={() => router.push({ params: { partCode }, pathname: '/stores/parts/[partCode]/receive' })}
          title="Receive against an order"
        />
        <ActionTile
          caption="Send stock back off a Purchase Order line"
          disabled={actor === null || !actions.returnToSupplier.allowed}
          icon={IconTruckReturn}
          onPress={() => router.push({ params: { partCode }, pathname: '/stores/parts/[partCode]/return-to-supplier' })}
          title="Return to Supplier"
        />
      </View>
    </StoresScreen>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0">
      <Text className="text-[11px] text-muted-foreground" mono numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-2xl leading-7 text-surface-foreground" numberOfLines={1} weight="bold">
        {value}
      </Text>
    </View>
  );
}

function ActionTile({
  caption,
  disabled,
  icon,
  onPress,
  title,
}: {
  caption: string;
  disabled: boolean;
  icon: React.ComponentProps<typeof Icon>['icon'];
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-4 ${disabled ? 'opacity-40' : ''}`}
      disabled={disabled}
      onPress={onPress}
    >
      <Icon className="text-surface-foreground" icon={icon} size={26} />
      <View className="min-w-0 flex-1">
        <Text className="text-base text-surface-foreground" weight="semibold">
          {title}
        </Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">{caption}</Text>
      </View>
    </Pressable>
  );
}

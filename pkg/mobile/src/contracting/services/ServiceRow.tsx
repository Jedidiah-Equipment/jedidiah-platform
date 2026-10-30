import { formatDate, getFirstName } from '@pkg/domain';
import { serviceRecordBadge } from '@pkg/domain/contracting';
import type { ServiceRecord } from '@pkg/schema/contracting';
import { router } from 'expo-router';
import { CatalogListCard } from '@/components/CatalogList';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { categoryTileProps } from '@/contracting/components/list-tiles';
import { useColorMode } from '@/theme/use-color-mode';
import { serviceRecordHref } from './service-routes';

/** One Service Record in the Services list, opening its own screen. */
export function ServiceRow({ record }: { record: ServiceRecord }) {
  const { resolved } = useColorMode();
  const tile = categoryTileProps(record.categoryIcon, record.categoryColour, resolved);
  const badge = serviceRecordBadge(record.status);
  // Start and end are calendar days, not moments, so they skip DateText's Today / Yesterday window.
  const metadata = [
    formatDate(record.startDate, 'short'),
    record.mechanicName ? getFirstName(record.mechanicName) : null,
    record.endDate ? `Closed ${formatDate(record.endDate, 'day')}` : null,
  ].filter((part): part is string => part !== null);
  return (
    <CatalogListCard
      accessibilityHint="Opens the service"
      accessibilityLabel={`Service on ${record.machineCode}, ${badge.label}`}
      avatarClassName={tile.className}
      avatarFallback={tile.fallback}
      avatarName={record.machineCode}
      mainText={record.machineCode}
      metadata={
        <Text className="min-w-0 flex-1 text-[10px] text-muted-foreground" mono numberOfLines={1}>
          {metadata.join(' · ')}
        </Text>
      }
      onPress={() => router.push(serviceRecordHref(record.id))}
      subText={record.notes?.split('\n')[0]?.trim() || 'No notes'}
      trailing={<StatusBadge classNames={badge.colours} label={badge.label} />}
    />
  );
}

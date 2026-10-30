import { formatHours } from '@pkg/domain';
import {
  hoursToServiceLabel,
  knownHoursSourceSuffix,
  machineServiceBadge,
  serviceDueStatusColorClassNames,
} from '@pkg/domain/contracting';
import type { FieldMachine } from '@pkg/schema/contracting';
import { router } from 'expo-router';
import { CatalogListCard } from '@/components/CatalogList';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { categoryTileProps } from '@/contracting/components/list-tiles';
import { useColorMode } from '@/theme/use-color-mode';

/** A Machine Due for Service, pinned above the Service Records: it opens the Machine, and books it in when `onBook` is given. */
export function DueMachineRow({ machine, onBook }: { machine: FieldMachine; onBook?: () => void }) {
  const { resolved } = useColorMode();
  const tile = categoryTileProps(machine.categoryIcon, machine.categoryColour, resolved);
  const badge = machineServiceBadge(machine);
  const reading =
    machine.knownHours === null
      ? 'No known hours'
      : `${formatHours(machine.knownHours)}${knownHoursSourceSuffix(machine.knownHoursSource)}`;
  return (
    <CatalogListCard
      accessibilityHint="Opens the Machine"
      accessibilityLabel={`Machine ${machine.code}, ${badge.label}`}
      action={onBook ? <Button compact title="Book" onPress={onBook} /> : undefined}
      avatarClassName={tile.className}
      avatarFallback={tile.fallback}
      avatarName={machine.code}
      mainText={machine.code}
      metadata={
        <Text className="min-w-0 flex-1 text-[10px] text-muted-foreground" mono numberOfLines={1}>
          {reading}
          {machine.hoursToService === null ? null : (
            <Text className={`text-[10px] ${serviceDueStatusColorClassNames[machine.serviceDueStatus].text}`} mono>
              {` · ${hoursToServiceLabel(machine.hoursToService)}`}
            </Text>
          )}
        </Text>
      }
      onPress={() => router.push({ pathname: '/contracting/machines/[id]', params: { id: machine.id } })}
      subText={`${machine.make} ${machine.model} · ${machine.categoryName}`}
      trailing={<StatusBadge classNames={badge.colours} label={badge.label} size="compact" />}
    />
  );
}

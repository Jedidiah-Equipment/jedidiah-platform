import { formatHours } from '@pkg/domain';
import {
  hoursToServiceLabel,
  machineServiceBadge,
  serviceDueNeedsAttention,
  serviceDueStatusColorClassNames,
} from '@pkg/domain/contracting';
import type { FieldMachine } from '@pkg/schema/contracting';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { DetailRow } from '@/contracting/components/DetailRow';

/**
 * Where the Machine stands against its dash sticker: the due status, the due point, what is left, and the interval.
 * A screen puts what the Machine is above it and its own links below.
 */
export function MachineServiceCard({
  machine,
  header,
  children,
}: {
  machine: FieldMachine;
  header?: ReactNode;
  children?: ReactNode;
}) {
  const colours = serviceDueStatusColorClassNames[machine.serviceDueStatus];
  const badge = machineServiceBadge(machine);
  const remaining = machine.hoursToService;
  const flagged = serviceDueNeedsAttention(machine.serviceDueStatus);
  return (
    <Card>
      {header}
      <View className="flex-row">
        <StatusBadge classNames={badge.colours} label={badge.label} />
      </View>
      <DetailRow label="Next service due">
        <Text className="text-foreground" weight="semibold">
          {machine.nextServiceDueHours === null ? 'Not set' : formatHours(machine.nextServiceDueHours)}
        </Text>
      </DetailRow>
      {remaining !== null ? (
        <DetailRow label="To service">
          <Text className={flagged ? colours.text : 'text-foreground'} weight="semibold">
            {hoursToServiceLabel(remaining)}
          </Text>
        </DetailRow>
      ) : null}
      <DetailRow label="Service interval">
        <Text className="text-foreground" weight="semibold">
          {machine.serviceIntervalHours === null ? 'Not set' : formatHours(machine.serviceIntervalHours)}
        </Text>
      </DetailRow>
      {children}
    </Card>
  );
}

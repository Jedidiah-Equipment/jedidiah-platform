import { formatHours } from '@pkg/domain';
import { knownHoursSourceSuffix } from '@pkg/domain/contracting';
import type { FieldMachine } from '@pkg/schema/contracting';
import { DateText } from '@/components/DateText';
import { Text } from '@/components/ui/text';

/** The Machine's Known Hours as the headline of its card, and when and from where they came. */
export function MachineKnownHours({
  machine,
}: {
  machine: Pick<FieldMachine, 'knownHours' | 'knownHoursAt' | 'knownHoursSource'> | undefined;
}) {
  return (
    <>
      <Text className="text-3xl text-foreground" weight="bold">
        {machine?.knownHours != null ? formatHours(machine.knownHours) : 'No known hours'}
      </Text>
      {machine?.knownHoursAt ? (
        <Text className="text-sm text-muted-foreground">
          Known hours at{' '}
          <DateText className="text-sm text-muted-foreground" date={machine.knownHoursAt} format="medium" />
          {knownHoursSourceSuffix(machine.knownHoursSource)}
        </Text>
      ) : null}
    </>
  );
}

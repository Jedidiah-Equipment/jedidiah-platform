import { formatHours } from '@pkg/domain';
import { readingProviderSuffix } from '@pkg/domain/contracting';
import type { FieldMachine } from '@pkg/schema/contracting';
import { DateText } from '@/components/DateText';
import { Text } from '@/components/ui/text';

/** The Machine's current hours as the headline of its card, and when and from where they were read. */
export function MachineLatestReading({
  machine,
}: {
  machine: Pick<FieldMachine, 'latestReadingHours' | 'latestReadingAt' | 'latestReadingProvider'> | undefined;
}) {
  return (
    <>
      <Text className="text-3xl text-foreground" weight="bold">
        {machine?.latestReadingHours != null ? formatHours(machine.latestReadingHours) : 'No known reading'}
      </Text>
      {machine?.latestReadingAt ? (
        <Text className="text-sm text-muted-foreground">
          Read <DateText className="text-sm text-muted-foreground" date={machine.latestReadingAt} format="medium" />
          {readingProviderSuffix(machine.latestReadingProvider)}
        </Text>
      ) : null}
    </>
  );
}

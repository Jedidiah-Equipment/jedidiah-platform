import { formatDate, formatHours } from '@pkg/domain';
import { MISSING_PHOTO_EVIDENCE, readingRoleLabels } from '@pkg/domain/contracting';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useFleet, useMachineReadings } from '@/contracting/readings/use-fleet';
import { useSessionPermission } from '@/lib/auth-session';
import { CategoryIcon } from './CategoryIcon';

export default function MachineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fleet = useFleet();
  const machine = fleet.data?.find((row) => row.id === id);
  const readings = useMachineReadings(id);
  const latest = readings.data?.[0];
  const canCapture = useSessionPermission('contracting_reading:capture');
  const canReport = useSessionPermission('contracting_breakdown:report');
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title={machine?.code ?? 'Machine'}
        subtitle="CONTRACTING"
        parentLabel="Machines"
        onBack={() => router.replace('/contracting/machines' as Href)}
        helpTopic="contractingMobileMachine"
      />
      <ScrollView contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}>
        <View className="gap-2 rounded-xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-3">
            {machine ? <CategoryIcon icon={machine.categoryIcon} colour={machine.categoryColour} size={24} /> : null}
            <Text className="text-lg text-foreground" weight="bold">
              {machine ? `${machine.make} ${machine.model}` : 'Machine details unavailable'}
            </Text>
          </View>
          <Text className="text-muted-foreground">
            {machine?.categoryName} · {machine?.onSiteJobNumber ? `On Job · ${machine.onSiteJobNumber}` : 'In Yard'}
          </Text>
          <Text className="text-3xl text-foreground" weight="bold">
            {latest ? formatHours(latest.value) : 'No known reading'}
          </Text>
        </View>
        {canCapture && machine ? (
          <Button
            primary
            title="Capture reading"
            onPress={() =>
              router.push({
                pathname: '/contracting/machines/[id]/capture',
                params: { id },
              })
            }
          />
        ) : null}
        {canReport && machine ? (
          <Button
            title="Report a problem"
            onPress={() =>
              router.push({
                pathname: '/contracting/workshop/report',
                params: { subjectKind: 'machine', subjectId: id },
              })
            }
          />
        ) : null}
        <Text className="text-lg text-foreground" weight="bold">
          Reading history
        </Text>
        {readings.data?.map((row) => (
          <View key={row.id} className="gap-1 rounded-xl border border-border bg-surface p-4">
            <Text className="text-foreground" weight="semibold">
              {formatHours(row.value)} · {readingRoleLabels[row.role]}
            </Text>
            <Text className="text-sm text-muted-foreground">{formatDate(row.capturedAt, 'medium')}</Text>
            <Text className="text-sm text-muted-foreground">
              {row.photoBacked ? 'Photo-backed' : MISSING_PHOTO_EVIDENCE}
              {row.disputed ? ' · Disputed' : ''}
            </Text>
          </View>
        ))}
        {!readings.data?.length ? (
          <Text className="text-muted-foreground">
            {readings.isError
              ? 'History could not be loaded.'
              : readings.data
                ? 'No reading history.'
                : 'Loading reading history…'}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

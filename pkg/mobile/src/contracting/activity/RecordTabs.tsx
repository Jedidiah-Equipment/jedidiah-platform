import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SubTabControl, type SubTabOption } from '@/components/SubTabControl';

export type RecordTab = 'details' | 'activity';

const RECORD_TABS: readonly SubTabOption<RecordTab>[] = [
  { label: 'Details', value: 'details' },
  { label: 'Activity', value: 'activity' },
];

/**
 * The Details | Activity switch a Job and a Breakdown screen share. `?tab=activity` opens on the thread, so a link
 * to a note lands on it.
 */
export function useRecordTab() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return useState<RecordTab>(tab === 'activity' ? 'activity' : 'details');
}

export function RecordTabBar({ value, onChange }: { value: RecordTab; onChange: (tab: RecordTab) => void }) {
  return (
    <View className="border-b border-border px-4 py-3">
      <SubTabControl activeValue={value} onChange={onChange} tabs={RECORD_TABS} />
    </View>
  );
}

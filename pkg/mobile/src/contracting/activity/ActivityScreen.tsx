import { SafeAreaView } from 'react-native-safe-area-context';
import { MainToolbar } from '@/components/TopToolbar';
import { ContractingActivityFeed } from './ContractingActivityFeed';

/** The Contracting Activity tab: everything this person can see happen, newest first. */
export default function ActivityScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Activity" subtitle="CONTRACTING" helpTopic="contractingMobileActivity" />
      <ContractingActivityFeed trackGlobalView />
    </SafeAreaView>
  );
}

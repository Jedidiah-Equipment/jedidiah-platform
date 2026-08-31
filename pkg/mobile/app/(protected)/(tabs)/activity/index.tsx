import { SafeAreaView } from 'react-native-safe-area-context';

import { JobActivityFeed } from '@/components/activity/JobActivityFeed';
import { MainTabToolbar } from '@/components/TopToolbar';
import { MAIN_TAB_PARENTS } from '@/lib/toolbar-navigation';

/** Cross-Job feed. The Activity layout owns the route-level permission gate. */
export default function ActivityRoute() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <JobActivityFeed
        toolbar={(total) => (
          <MainTabToolbar
            assistantParent={MAIN_TAB_PARENTS.activity}
            helpTopic="jobActivity"
            subtitle={
              total === null ? 'Loading activity…' : `${total} ${total === 1 ? 'entry' : 'entries'}, newest first`
            }
            title="Activity"
          />
        )}
        trackGlobalView
      />
    </SafeAreaView>
  );
}

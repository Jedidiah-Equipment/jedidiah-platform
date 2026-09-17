import { IconBriefcase2, IconTractor } from '@tabler/icons-react-native';
import { useSegments } from 'expo-router';
import { TabBar } from '@/components/tab-bar/TabBar';
import {
  activeContractingTab,
  type ContractingTab,
  contractingTabHref,
  contractingTabLabel,
  visibleContractingTabs,
} from '@/contracting/lib/app-tabs';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { useSessionAccessSummary } from '@/lib/auth-session';

const ICONS = { jobs: IconBriefcase2, machines: IconTractor } as const;

export function ContractingTabBar() {
  const access = useSessionAccessSummary();
  const { items } = useReadingQueue();
  const tabs = visibleContractingTabs(access);
  const active = activeContractingTab(useSegments());
  return (
    <TabBar
      activeKey={active}
      tabs={tabs.map((tab: ContractingTab) => ({
        key: tab,
        label: contractingTabLabel(tab),
        icon: ICONS[tab],
        href: contractingTabHref(tab),
        badge: tab === 'machines' && items.some((item) => item.attention),
      }))}
    />
  );
}

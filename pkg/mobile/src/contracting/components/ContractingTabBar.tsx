import { IconBriefcase2, IconNotes, IconTractor } from '@tabler/icons-react-native';
import { useSegments } from 'expo-router';
import { TabBar } from '@/components/tab-bar/TabBar';
import { useFieldNotes } from '@/contracting/field-notes/FieldNotesProvider';
import {
  activeContractingTab,
  CONTRACTING_TAB_HREF,
  CONTRACTING_TAB_LABEL,
  contractingTabBadge,
  visibleContractingTabs,
} from '@/contracting/lib/app-tabs';
import { useSessionAccessSummary } from '@/lib/auth-session';

const ICONS = { jobs: IconBriefcase2, machines: IconTractor, notes: IconNotes } as const;

export function ContractingTabBar() {
  const access = useSessionAccessSummary();
  const { notes } = useFieldNotes();
  const tabs = visibleContractingTabs(access);
  const active = activeContractingTab(useSegments());
  return (
    <TabBar
      activeKey={active}
      tabs={tabs.map((tab) => ({
        key: tab,
        label: CONTRACTING_TAB_LABEL[tab],
        icon: ICONS[tab],
        href: CONTRACTING_TAB_HREF[tab],
        badge: contractingTabBadge(tab, notes ?? []),
        badgeLabel: 'open field notes',
      }))}
    />
  );
}

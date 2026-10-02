import { Redirect } from 'expo-router';
import { CONTRACTING_TAB_HREF, visibleContractingTabs } from '@/contracting/lib/app-tabs';
import { useSessionAccessSummary } from '@/lib/auth-session';

export default function ContractingIndex() {
  const [first = 'notes'] = visibleContractingTabs(useSessionAccessSummary());
  return <Redirect href={CONTRACTING_TAB_HREF[first]} />;
}

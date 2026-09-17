import { type Href, Redirect } from 'expo-router';
import { useSessionPermission } from '@/lib/auth-session';

export default function ContractingIndex() {
  const canReadJobs = useSessionPermission('contracting_job:read-own', 'contracting_job:read');
  return <Redirect href={(canReadJobs ? '/contracting/jobs' : '/contracting/machines') as Href} />;
}

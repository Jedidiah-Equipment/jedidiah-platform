import { fieldJobAccessMode } from '@pkg/domain/contracting';
import { type Href, Redirect } from 'expo-router';
import { useSessionAccessSummary } from '@/lib/auth-session';

export default function ContractingIndex() {
  const canReadJobs = fieldJobAccessMode(useSessionAccessSummary()) !== null;
  return <Redirect href={(canReadJobs ? '/contracting/jobs' : '/contracting/machines') as Href} />;
}

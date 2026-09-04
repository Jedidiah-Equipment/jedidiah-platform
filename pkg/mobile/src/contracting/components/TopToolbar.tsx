import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { MainToolbar } from '@/components/TopToolbar';

export function MainTabToolbar({ subtitle, title }: { subtitle: string; title: string }) {
  return <MainToolbar actions={<ProfileMenuButton />} subtitle={subtitle} title={title} />;
}

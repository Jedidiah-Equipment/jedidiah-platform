import { SafeAreaView } from 'react-native-safe-area-context';
import { MainToolbar } from '@/components/TopToolbar';
import { ServicesList } from './ServicesList';

export default function ServicesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Services" subtitle="CONTRACTING" helpTopic="contractingMobileServices" />
      <ServicesList scope={null} />
    </SafeAreaView>
  );
}

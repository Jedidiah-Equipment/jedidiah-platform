import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BaysSmokeList } from '@/components/BaysSmokeList';
import { BrandHeader } from '@/components/BrandHeader';
import { Text } from '@/components/ui/text';
import { signOut } from '@/lib/auth';
import { useAuthSession } from '@/lib/auth-session';

export default function IndexRoute() {
  // The protected layout guarantees a resolved session by the time we render.
  const session = useAuthSession();
  const role = session.user.role ?? 'unknown';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center gap-6 px-7 py-10">
        <BrandHeader subtitle={`Signed in as ${session.user.name} · ${role}`} />

        <BaysSmokeList />

        <Pressable
          accessibilityRole="button"
          className="min-h-[52px] items-center justify-center self-start rounded-lg bg-primary px-5"
          onPress={signOut}
        >
          <Text className="text-base leading-6 text-primary-foreground" weight="bold">
            Sign out
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

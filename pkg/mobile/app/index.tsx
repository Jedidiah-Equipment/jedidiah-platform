import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut, useSession } from '../lib/auth';
import { BrandHeader } from '../src/components/BrandHeader';
import { Text } from '../src/components/ui/text';

export default function IndexRoute() {
  const { data: session, isPending } = useSession();

  if (isPending || !session) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 justify-center px-7 py-10">
          <Text className="text-base leading-6 text-muted-foreground">Checking session</Text>
        </View>
      </SafeAreaView>
    );
  }

  const role = session.user.role ?? 'unknown';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center px-7 py-10">
        <BrandHeader subtitle={`Signed in as ${session.user.name} · ${role}`} />

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

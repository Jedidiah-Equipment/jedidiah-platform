import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { signOut, useSession } from '../lib/auth';
import { BrandHeader } from '../src/components/BrandHeader';
import { theme } from '../src/theme';

export default function IndexRoute() {
  const { data: session, isPending } = useSession();

  if (isPending || !session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.statusText}>Checking session</Text>
        </View>
      </SafeAreaView>
    );
  }

  const role = session.user.role ?? 'unknown';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <BrandHeader subtitle={`Signed in as ${session.user.name} · ${role}`} />

        <Pressable accessibilityRole="button" onPress={signOut} style={styles.button}>
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    lineHeight: 24,
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: theme.spacing.lg,
  },
  buttonText: {
    color: theme.colors.onPrimary,
    fontSize: theme.typography.body,
    fontWeight: '700',
    lineHeight: 24,
  },
});

import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { signOut, useSession } from '../lib/auth';
import { theme } from '../src/theme';

export default function IndexRoute() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const userName = session?.user.name ?? 'Signed in';
  const userRole = getUserRole(session?.user);

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  if (isPending || !session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.statusText}>Checking session</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>J</Text>
          </View>
          <Text style={styles.title}>Jedidah Ops</Text>
          <Text style={styles.statusText}>
            Signed in as {userName} · {userRole}
          </Text>
        </View>

        <Pressable accessibilityRole="button" onPress={handleSignOut} style={styles.button}>
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
  header: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  brandMarkText: {
    color: theme.colors.primary,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  title: {
    color: theme.colors.ink,
    fontSize: theme.typography.title,
    fontWeight: '700',
    lineHeight: 40,
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

function getUserRole(user: unknown) {
  if (!user || typeof user !== 'object' || !('role' in user)) {
    return 'unknown';
  }

  const role = user.role;

  return typeof role === 'string' ? role : 'unknown';
}

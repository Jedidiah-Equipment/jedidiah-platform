import { APP_ROLES } from '@pkg/schema';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '../src/theme';

const buttonColor = APP_ROLES.includes('sales') ? theme.colors.primary : theme.colors.ink;

export default function LoginScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>J</Text>
            </View>
            <Text style={styles.title}>Jedidah Ops</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="name@jedidiahequipment.co.za"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
                textContentType="emailAddress"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="password"
                placeholder="Enter your password"
                placeholderTextColor={theme.colors.muted}
                secureTextEntry
                style={styles.input}
                textContentType="password"
              />
            </View>

            <Pressable accessibilityRole="button" style={[styles.button, { backgroundColor: buttonColor }]}>
              <Text style={styles.buttonText}>Sign in</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  header: {
    alignItems: 'flex-start',
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
  subtitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    lineHeight: 24,
  },
  form: {
    gap: theme.spacing.lg,
  },
  field: {
    gap: theme.spacing.xs,
  },
  label: {
    color: theme.colors.ink,
    fontSize: theme.typography.label,
    fontWeight: '600',
    lineHeight: 20,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.ink,
    fontSize: theme.typography.body,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
  },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
  },
  buttonText: {
    color: theme.colors.onPrimary,
    fontSize: theme.typography.body,
    fontWeight: '700',
    lineHeight: 24,
  },
});

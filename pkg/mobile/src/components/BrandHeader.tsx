import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

export function BrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.brandMark}>
        <Text style={styles.brandMarkText}>J</Text>
      </View>
      <Text style={styles.title}>Jedidah Ops</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});

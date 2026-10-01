import { formatDate } from '@pkg/domain';
import type { CustomerPossibleMatch } from '@pkg/schema/equipment';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';

export function useCustomerMatchChoice() {
  const mounted = useRef(true);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [matches, setMatches] = useState<CustomerPossibleMatch[]>([]);
  const resolve = useRef<((choice: CustomerPossibleMatch | 'create' | null) => void) | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resolve.current?.(null);
    };
  }, []);
  const finish = (choice: CustomerPossibleMatch | 'create' | null) => {
    resolve.current?.(choice);
    resolve.current = null;
    setMatches([]);
  };
  const choose = async (companyName: string) => {
    const found = await queryClient.fetchQuery({
      ...trpc.customers.findPossibleMatches.queryOptions({ companyName }),
      staleTime: 0,
    });
    if (!mounted.current) return null;
    if (!found.length) return 'new' as const;
    setMatches(found);
    return new Promise<CustomerPossibleMatch | 'create' | null>((done) => {
      resolve.current = done;
    });
  };
  const content = matches.length ? (
    <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
      <Text weight="bold" className="text-lg text-foreground">
        Possible Customer match
      </Text>
      <Text className="text-foreground">
        Use an existing Customer, or create another if this is a different company.
      </Text>
      {matches.map((match) => (
        <View key={match.id} className="gap-2 rounded-lg border border-border p-3">
          <Text className="text-foreground">
            Possible match: {match.companyName}
            {match.contactPerson ? ` (${match.contactPerson})` : ''} — use it instead?
          </Text>
          <Text className="text-muted-foreground">
            {match.email ? `${match.email} · ` : ''}Created {formatDate(match.createdAt, 'medium')}
          </Text>
          <Pressable accessibilityRole="button" className="rounded-lg bg-primary p-3" onPress={() => finish(match)}>
            <Text className="text-primary-foreground">Use this Customer</Text>
          </Pressable>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        className="rounded-lg border border-border p-3"
        onPress={() => finish('create')}
      >
        <Text className="text-foreground">Create anyway</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        className="rounded-lg border border-border p-3"
        onPress={() => finish(null)}
      >
        <Text className="text-foreground">Go back</Text>
      </Pressable>
    </ScrollView>
  ) : null;
  return { choose, content, cancel: () => finish(null) };
}

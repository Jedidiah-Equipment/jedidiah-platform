import type { Customer } from '@pkg/schema';
import { IconPlus } from '@tabler/icons-react-native';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FieldShell } from '@/components/form/fields/FieldShell';
import type { FormFieldError } from '@/components/form/utils/field-errors';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';

type CustomerOption = Pick<Customer, 'companyName' | 'email' | 'id' | 'thumbnailDataUrl'>;

export type CustomerSelection =
  | { customer: CustomerOption; type: 'existing' }
  | { companyName: string; type: 'inline' };

export function CustomerPicker({
  errors,
  onSelected,
  selection,
}: {
  errors: FormFieldError[];
  onSelected: (selection: CustomerSelection | null) => void;
  selection: CustomerSelection | null;
}) {
  const trpc = useTRPC();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);

  const customers = useQuery(
    trpc.quotes.customers.queryOptions(
      {
        page: 1,
        pageSize: 20,
        search: debouncedSearch,
        sortBy: 'companyName',
        sortDirection: 'asc',
      },
      { enabled: expanded },
    ),
  );
  const options = customers.data?.items ?? [];
  const trimmedSearch = search.trim();
  const canCreate =
    trimmedSearch.length > 0 &&
    !options.some((customer) => customer.companyName.toLowerCase() === trimmedSearch.toLowerCase());
  const selectedLabel = selection?.type === 'existing' ? selection.customer.companyName : selection?.companyName;
  const displayValue = expanded ? search : (selectedLabel ?? '');
  const rows = useMemo<CustomerSelection[]>(
    () => [
      ...options.map((customer) => ({ customer, type: 'existing' as const })),
      ...(canCreate ? [{ companyName: trimmedSearch, type: 'inline' as const }] : []),
    ],
    [canCreate, options, trimmedSearch],
  );

  const updateSearch = (value: string) => {
    if (selection) onSelected(null);
    setSearch(value);
  };

  return (
    <FieldShell errors={errors} label="Customer">
      <TextInput
        accessibilityLabel="Customer"
        className={`h-12 ${errors.length > 0 ? 'border-danger' : ''}`}
        onChangeText={updateSearch}
        onFocus={() => {
          setSearch(selectedLabel ?? '');
          setExpanded(true);
        }}
        placeholder={customers.isFetching ? 'Searching customers…' : 'Search or create customer'}
        value={displayValue}
      />

      {expanded ? (
        <View className="overflow-hidden rounded-xl border border-border bg-surface" style={{ maxHeight: 220 }}>
          {customers.isPending ? (
            <View className="items-center px-3 py-4">
              <ActivityIndicator size="small" />
            </View>
          ) : rows.length === 0 ? (
            <View className="px-3 py-3">
              <Text className="text-sm text-muted-foreground">No customers found.</Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {rows.map((row, index) => {
                const key = row.type === 'inline' ? `inline:${row.companyName}` : row.customer.id;

                return (
                  <Pressable
                    accessibilityRole="button"
                    className={`flex-row items-center gap-3 px-3 py-3 active:bg-muted ${
                      index > 0 ? 'border-t border-border' : ''
                    }`}
                    key={key}
                    onPress={() => {
                      if (row.type === 'inline') {
                        onSelected({ companyName: row.companyName, type: 'inline' });
                      } else {
                        onSelected({ customer: row.customer, type: 'existing' });
                      }
                      setSearch('');
                      setExpanded(false);
                    }}
                  >
                    {row.type === 'inline' ? (
                      <Icon className="text-primary" icon={IconPlus} size={20} />
                    ) : (
                      <Avatar
                        className="h-8 w-8 rounded-lg"
                        name={row.customer.companyName}
                        textClassName="text-[9px]"
                        uri={row.customer.thumbnailDataUrl}
                      />
                    )}
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm text-surface-foreground" numberOfLines={1} weight="semibold">
                        {row.type === 'inline' ? `Create “${row.companyName}”` : row.customer.companyName}
                      </Text>
                      {row.type === 'existing' && row.customer.email ? (
                        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                          {row.customer.email}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}
    </FieldShell>
  );
}

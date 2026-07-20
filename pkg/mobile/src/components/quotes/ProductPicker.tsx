import type { Product } from '@pkg/schema';
import { IconCheck, IconChevronDown } from '@tabler/icons-react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FieldShell } from '@/components/form/fields/FieldShell';
import type { FormFieldError } from '@/components/form/utils/field-errors';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';

export type ProductSelection = Pick<Product, 'id' | 'modelCode' | 'name' | 'thumbnailDataUrl'>;

export function ProductPicker({
  errors,
  onProductSelected,
  onRangeChange,
  product,
  rangeId,
}: {
  errors: FormFieldError[];
  onProductSelected: (product: ProductSelection | null) => void;
  onRangeChange: (rangeId: string) => void;
  product: ProductSelection | null;
  rangeId: string;
}) {
  const trpc = useTRPC();
  const [rangeExpanded, setRangeExpanded] = useState(false);
  const [productsExpanded, setProductsExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const ranges = useQuery(trpc.quotes.rangeOptions.queryOptions(undefined));

  const products = useQuery(
    trpc.quotes.products.queryOptions(
      {
        columnFilters: rangeId ? { rangeId } : {},
        page: 1,
        pageSize: 20,
        search: debouncedSearch,
        sortBy: 'name',
        sortDirection: 'asc',
      },
      { enabled: productsExpanded },
    ),
  );
  const rangeOptions = ranges.data?.ranges ?? [];
  const selectedRange = rangeOptions.find((range) => range.id === rangeId);
  const productOptions = products.data?.items ?? [];
  const displayValue = productsExpanded ? search : (product?.name ?? '');

  return (
    <View className="gap-4">
      <FieldShell errors={[]} label="Range">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: rangeExpanded }}
          className="h-12 flex-row items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 active:bg-muted"
          onPress={() => setRangeExpanded((value) => !value)}
        >
          <Text className="text-surface-foreground" numberOfLines={1}>
            {selectedRange?.name ?? 'All ranges'}
          </Text>
          <Icon className="text-muted-foreground" icon={IconChevronDown} size={16} />
        </Pressable>

        {rangeExpanded ? (
          <View className="overflow-hidden rounded-xl border border-border bg-surface" style={{ maxHeight: 220 }}>
            {ranges.isPending ? (
              <View className="items-center px-3 py-4">
                <ActivityIndicator size="small" />
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {[{ id: '', name: 'All ranges' }, ...rangeOptions].map((range, index) => {
                  const active = range.id === rangeId;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className={`flex-row items-center justify-between gap-3 px-3 py-3 active:bg-muted ${
                        index > 0 ? 'border-t border-border' : ''
                      }`}
                      key={range.id || 'all-ranges'}
                      onPress={() => {
                        onRangeChange(range.id);
                        onProductSelected(null);
                        setSearch('');
                        setRangeExpanded(false);
                      }}
                    >
                      <Text className={active ? 'text-primary' : 'text-surface-foreground'}>{range.name}</Text>
                      {active ? <Icon className="text-primary" icon={IconCheck} size={16} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        ) : null}
      </FieldShell>

      <FieldShell errors={errors} label="Product">
        <TextInput
          accessibilityLabel="Product"
          className={`h-12 ${errors.length > 0 ? 'border-danger' : ''}`}
          onChangeText={(value) => {
            if (product) onProductSelected(null);
            setSearch(value);
          }}
          onFocus={() => {
            setSearch(product?.name ?? '');
            setProductsExpanded(true);
          }}
          placeholder={products.isFetching ? 'Searching products…' : 'Search products'}
          value={displayValue}
        />

        {productsExpanded ? (
          <View className="overflow-hidden rounded-xl border border-border bg-surface" style={{ maxHeight: 220 }}>
            {products.isPending ? (
              <View className="items-center px-3 py-4">
                <ActivityIndicator size="small" />
              </View>
            ) : productOptions.length === 0 ? (
              <View className="px-3 py-3">
                <Text className="text-sm text-muted-foreground">No products found.</Text>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {productOptions.map((option, index) => (
                  <Pressable
                    accessibilityRole="button"
                    className={`flex-row items-center gap-3 px-3 py-3 active:bg-muted ${
                      index > 0 ? 'border-t border-border' : ''
                    }`}
                    key={option.id}
                    onPress={() => {
                      onProductSelected(option);
                      setSearch('');
                      setProductsExpanded(false);
                    }}
                  >
                    <Avatar
                      className="h-8 w-8 rounded-lg"
                      name={option.name}
                      textClassName="text-[9px]"
                      uri={option.thumbnailDataUrl}
                    />
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm text-surface-foreground" numberOfLines={1} weight="semibold">
                        {option.name}
                      </Text>
                      <Text className="text-xs text-muted-foreground" mono numberOfLines={1}>
                        {option.modelCode}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </FieldShell>
    </View>
  );
}

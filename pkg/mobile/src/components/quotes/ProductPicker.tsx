import type { Product } from '@pkg/schema';
import { IconCheck, IconChevronDown } from '@tabler/icons-react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FieldShell } from '@/components/form/fields/FieldShell';
import type { FormFieldError } from '@/components/form/utils/field-errors';
import { Icon } from '@/components/ui/icon';
import { PickerDropdown } from '@/components/ui/picker-dropdown';
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
          <Text className="text-sm text-surface-foreground" numberOfLines={1}>
            {selectedRange?.name ?? 'All ranges'}
          </Text>
          <Icon className="text-muted-foreground" icon={IconChevronDown} size={16} />
        </Pressable>

        <PickerDropdown
          emptyMessage="No ranges available."
          keyOf={(range) => range.id || 'all-ranges'}
          onSelect={(range) => {
            onRangeChange(range.id);
            onProductSelected(null);
            setSearch('');
            setRangeExpanded(false);
          }}
          open={rangeExpanded}
          pending={ranges.isPending}
          renderRow={(range) => (
            <>
              <Text className={`min-w-0 flex-1 ${range.id === rangeId ? 'text-primary' : 'text-surface-foreground'}`}>
                {range.name}
              </Text>
              {range.id === rangeId ? <Icon className="text-primary" icon={IconCheck} size={16} /> : null}
            </>
          )}
          rows={[{ id: '', name: 'All ranges' }, ...rangeOptions]}
          selectedKey={rangeId || 'all-ranges'}
        />
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

        <PickerDropdown
          emptyMessage="No products found."
          keyOf={(option) => option.id}
          onSelect={(option) => {
            onProductSelected(option);
            setSearch('');
            setProductsExpanded(false);
          }}
          open={productsExpanded}
          pending={products.isPending}
          renderRow={(option) => (
            <>
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
            </>
          )}
          rows={productOptions}
        />
      </FieldShell>
    </View>
  );
}

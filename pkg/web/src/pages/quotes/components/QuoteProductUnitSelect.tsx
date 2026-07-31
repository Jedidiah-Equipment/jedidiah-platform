import { ProductUnitListInput, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useTRPC } from '@/lib/trpc.js';
import { buildStateLabels, toDisplayBuildState } from '@/pages/units/components/ProductUnitOwnerCell.js';

const BUILD_TO_ORDER = 'build-to-order';

export const QuoteProductUnitSelect: React.FC<{
  disabled?: boolean;
  id?: string;
  onChange: (productUnitId: string) => void;
  productId: string;
  value: string;
}> = ({ disabled = false, id, onChange, productId, value }) => {
  const trpc = useTRPC();
  const parsedProductId = UUID.safeParse(productId);
  const unitsQuery = useQuery(
    trpc.productUnits.list.queryOptions(
      ProductUnitListInput.parse({
        columnFilters: {
          owner: 'stock',
          ...(parsedProductId.success ? { productId: parsedProductId.data } : {}),
        },
        cursor: 0,
        limit: 0,
        search: '',
        sortBy: 'productSerialNumber',
        sortDirection: 'asc',
      }),
      { enabled: parsedProductId.success },
    ),
  );
  const selectedUnit = unitsQuery.data?.items.find((unit) => unit.id === value);

  return (
    <Select
      disabled={disabled || !parsedProductId.success || unitsQuery.isPending}
      onValueChange={(nextValue) => onChange(nextValue === BUILD_TO_ORDER ? '' : (nextValue ?? ''))}
      value={value || BUILD_TO_ORDER}
    >
      <SelectTrigger className="w-full" id={id}>
        <SelectValue placeholder={unitsQuery.isPending ? 'Loading Stock units...' : 'Build to order'}>
          {selectedUnit ? selectedUnit.productSerialNumber : 'Build to order'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={BUILD_TO_ORDER}>Build to order</SelectItem>
          {unitsQuery.data?.items.map((unit) => (
            <SelectItem key={unit.id} value={unit.id}>
              {unit.productSerialNumber} · {buildStateLabels[toDisplayBuildState(unit.buildState, unit.owner)]}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

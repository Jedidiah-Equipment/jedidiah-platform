import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { TabsTrigger } from '@/components/ui/tabs.js';
import { useTRPC } from '@/lib/trpc.js';

type ProductBaysTabTriggerProps = {
  productId: UUID;
};

export const ProductBaysTabTrigger: React.FC<ProductBaysTabTriggerProps> = ({ productId }) => {
  const trpc = useTRPC();
  const productQuery = useQuery(trpc.products.get.queryOptions({ id: productId }));
  const hasNoBays = productQuery.data?.productBays.length === 0;

  return (
    <TabsTrigger value="bays">
      <span>Bays</span>
      {hasNoBays ? (
        <>
          <span aria-hidden className="size-2 rounded-full bg-orange-400" />
          <span className="sr-only">No Bay estimates added</span>
        </>
      ) : null}
    </TabsTrigger>
  );
};

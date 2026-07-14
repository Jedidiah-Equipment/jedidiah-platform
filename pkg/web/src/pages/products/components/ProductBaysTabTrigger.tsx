import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { AttentionTabTrigger } from '@/components/common/AttentionTabTrigger.js';
import { useTRPC } from '@/lib/trpc.js';

type ProductBaysTabTriggerProps = {
  productId: UUID;
};

export const ProductBaysTabTrigger: React.FC<ProductBaysTabTriggerProps> = ({ productId }) => {
  const trpc = useTRPC();
  const productQuery = useQuery(trpc.products.get.queryOptions({ id: productId }));
  const hasNoBays = productQuery.data?.productBays.length === 0;

  return (
    <AttentionTabTrigger attentionLabel="No Bay estimates added" label="Bays" needsAttention={hasNoBays} value="bays" />
  );
};

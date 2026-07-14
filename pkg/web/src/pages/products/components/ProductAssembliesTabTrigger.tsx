import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { AttentionTabTrigger } from '@/components/common/AttentionTabTrigger.js';
import { useTRPC } from '@/lib/trpc.js';

type ProductAssembliesTabTriggerProps = {
  productId: UUID;
};

export const ProductAssembliesTabTrigger: React.FC<ProductAssembliesTabTriggerProps> = ({ productId }) => {
  const trpc = useTRPC();
  const productQuery = useQuery(trpc.products.get.queryOptions({ id: productId }));
  const hasNoStandardAssemblies =
    productQuery.data?.assemblies.some((assembly) => assembly.kind === 'standard') === false;

  return (
    <AttentionTabTrigger
      attentionLabel="No standard assemblies added"
      label="Assemblies"
      needsAttention={hasNoStandardAssemblies}
      value="assemblies"
    />
  );
};

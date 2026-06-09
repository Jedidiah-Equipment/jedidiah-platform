import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { TabsTrigger } from '@/components/ui/tabs.js';
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
    <TabsTrigger value="assemblies">
      <span>Assemblies</span>
      {hasNoStandardAssemblies ? (
        <>
          <span aria-hidden className="size-2 rounded-full bg-orange-400" />
          <span className="sr-only">No standard assemblies added</span>
        </>
      ) : null}
    </TabsTrigger>
  );
};

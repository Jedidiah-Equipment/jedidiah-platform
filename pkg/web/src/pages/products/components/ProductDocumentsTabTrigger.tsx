import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { TabsTrigger } from '@/components/ui/tabs.js';
import { useTRPC } from '@/lib/trpc.js';

type ProductDocumentsTabTriggerProps = {
  productId: UUID;
};

export const ProductDocumentsTabTrigger: React.FC<ProductDocumentsTabTriggerProps> = ({ productId }) => {
  const trpc = useTRPC();
  const documentsQuery = useQuery(trpc.documents.listByProduct.queryOptions({ productId }));
  const hasNoDocuments = documentsQuery.data?.length === 0;

  return (
    <TabsTrigger value="documents">
      <span>Documents</span>
      {hasNoDocuments ? (
        <>
          <span aria-hidden className="size-2 rounded-full bg-orange-400" />
          <span className="sr-only">No documents added</span>
        </>
      ) : null}
    </TabsTrigger>
  );
};

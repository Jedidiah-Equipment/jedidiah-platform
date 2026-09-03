import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { AttentionTabTrigger } from '@/components/common/AttentionTabTrigger.js';
import { useTRPC } from '@/lib/trpc.js';

type ProductDocumentsTabTriggerProps = {
  productId: UUID;
};

export const ProductDocumentsTabTrigger: React.FC<ProductDocumentsTabTriggerProps> = ({ productId }) => {
  const trpc = useTRPC();
  const documentsQuery = useQuery(trpc.documents.listByProduct.queryOptions({ productId }));
  const hasNoDocuments = documentsQuery.data?.length === 0;

  return (
    <AttentionTabTrigger
      attentionLabel="No documents added"
      label="Documents"
      needsAttention={hasNoDocuments}
      value="documents"
    />
  );
};

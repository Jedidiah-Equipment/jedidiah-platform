import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';

/** Mutation options for a Job write, by where it is fired from. */
export const useJobWrite = () => useContractingWrite(useQueryInvalidation().invalidateJobs);

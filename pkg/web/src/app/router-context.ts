import type { QueryClient } from '@tanstack/react-query';

import type { TrpcOptions } from '@/lib/trpc.js';

export type RouterContext = {
  queryClient: QueryClient;
  trpc: TrpcOptions;
};

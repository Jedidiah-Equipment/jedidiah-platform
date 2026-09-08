import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc.js';
export function useDirectoryInvalidation() {
  const trpc = useTRPC();
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: trpc.contractingDirectory.pathKey() });
}

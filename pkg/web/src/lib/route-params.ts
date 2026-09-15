import { UUID } from '@pkg/schema';

/** Route `params` config for a `$id` segment that must be a UUID. */
export const uuidParams = {
  parse: (params: { id: string }) => ({ id: UUID.parse(params.id) }),
};

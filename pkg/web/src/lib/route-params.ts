import { UUID } from '@pkg/schema';
import { notFound } from '@tanstack/react-router';

/** Route `params` config for a `$id` segment that must be a UUID; anything else is a page that does not exist. */
export const uuidParams = {
  parse: (params: { id: string }) => {
    const id = UUID.safeParse(params.id);
    if (!id.success) throw notFound();
    return { id: id.data };
  },
};

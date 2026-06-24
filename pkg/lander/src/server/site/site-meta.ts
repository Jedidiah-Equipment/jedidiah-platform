import { createServerFn } from '@tanstack/react-start';

export type SiteMeta = { indexable: boolean };

// Resolves the per-environment site flags the root head needs. The indexing gate is read inside the handler
// (server-only) and serialized to the client, so the head renders the same `noindex` decision on the server
// and after hydration. Mirrors the other server fns: the env dep loads inside the handler to stay off the
// client bundle.
export const getSiteMeta = createServerFn({ method: 'GET' }).handler(async (): Promise<SiteMeta> => {
  const { isSiteIndexable } = await import('./site-indexable.js');

  return { indexable: isSiteIndexable() };
});

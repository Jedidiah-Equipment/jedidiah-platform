import { AppEnv } from '@pkg/schema';

// The public site should only be crawled and indexed in production. Staging and development must stay out
// of search results entirely. The gate reads APP_ENV at request time rather than at build time, so a single
// build artifact deployed to several environments still behaves correctly per environment. Anything that
// isn't explicitly production is treated as non-indexable (fail closed).
export function isSiteIndexable(env: NodeJS.ProcessEnv = process.env): boolean {
  return AppEnv.catch('development').parse(env.APP_ENV) === 'production';
}

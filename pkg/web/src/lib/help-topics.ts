import type { HelpTopic } from '@pkg/domain';

export type HelpTopicRoute = readonly [prefix: string, topic: HelpTopic];

const segmentsOf = (path: string) => path.split('/').filter(Boolean);
const isParam = (segment: string) => segment.startsWith('$');

/**
 * Resolves which docs topic a screen belongs to, by route prefix. Deliberately coarse: an area gets one
 * topic and its detail routes inherit it. Table order does not matter — the most specific matching prefix wins,
 * so a route nested under another area beats the area it sits in. A prefix only matches whole segments, and a
 * `$param` segment matches any one, as the route tree names it, for a detail page whose Help differs from its list's.
 */
export function createHelpTopicResolver(
  routes: readonly HelpTopicRoute[],
  fallback: HelpTopic,
): (pathname: string) => HelpTopic {
  const params = (pattern: string[]) => pattern.filter(isParam).length;
  const mostSpecificFirst = routes
    .map(([prefix, topic]) => ({ pattern: segmentsOf(prefix), topic }))
    .sort((a, b) => b.pattern.length - a.pattern.length || params(a.pattern) - params(b.pattern));

  return (pathname) => {
    const path = segmentsOf(pathname);
    return (
      mostSpecificFirst.find(
        ({ pattern }) =>
          pattern.length <= path.length &&
          pattern.every((segment, index) => isParam(segment) || segment === path[index]),
      )?.topic ?? fallback
    );
  };
}

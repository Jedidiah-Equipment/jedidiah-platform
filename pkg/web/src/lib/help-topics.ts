import type { HelpTopic } from '@pkg/domain';

export type HelpTopicRoute = readonly [prefix: string, topic: HelpTopic];

/**
 * Resolves which docs topic a screen belongs to, by route prefix. Deliberately coarse: an area gets one
 * topic and its detail routes inherit it. Table order does not matter — the longest matching prefix wins,
 * so a route nested under another area beats the area it sits in. A prefix only matches whole segments.
 */
export function createHelpTopicResolver(
  routes: readonly HelpTopicRoute[],
  fallback: HelpTopic,
): (pathname: string) => HelpTopic {
  const byLongestPrefix = [...routes].sort(([a], [b]) => b.length - a.length);

  return (pathname) =>
    byLongestPrefix.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? fallback;
}

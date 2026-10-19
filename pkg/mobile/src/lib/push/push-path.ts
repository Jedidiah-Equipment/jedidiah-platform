import { PushData } from '@pkg/schema';

/** Where a tapped push opens: the path to push, its pathname without the query, which the router reports there, and the record kind it names. */
export type PushTarget = { href: string; pathname: string; kind: PushData['kind'] };

/** The app path a push opens, from its data; only data the push contract accepts, whose path is inside its business, is followed. */
export function pushTargetFromData(data: unknown): PushTarget | null {
  const parsed = PushData.safeParse(data);
  if (!parsed.success) return null;
  const { path, kind } = parsed.data;
  const query = path.indexOf('?');
  return { href: path, pathname: query === -1 ? path : path.slice(0, query), kind };
}

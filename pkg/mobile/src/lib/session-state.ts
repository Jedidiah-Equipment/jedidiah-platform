type SessionLike = { user?: { id?: string } } | null | undefined;

export function isHydratedSession<T extends SessionLike>(
  session: T,
): session is Exclude<T, null | undefined> & {
  user: NonNullable<Exclude<T, null | undefined>['user']>;
} {
  // Better Auth can expose a truthy pre-hydration snapshot before its user is populated.
  return session?.user != null;
}

export function sessionUserId(session: SessionLike) {
  return session?.user?.id ?? null;
}

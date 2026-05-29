import type { Context } from '../../trpc/context.js';
import { protectedProcedure, publicProcedure, router } from '../../trpc/init.js';

export const authRouter = router({
  access: protectedProcedure.query(({ ctx }) => ctx.access),
  session: publicProcedure.query(({ ctx }) => serializeAuthSession(ctx.session)),
  me: protectedProcedure.query(({ ctx }) => serializeAuthUser(ctx.session.user)),
});

type AuthSession = NonNullable<Context['session']>;

function serializeAuthSession(session: Context['session']) {
  if (!session) {
    return null;
  }

  return {
    session: {
      ...session.session,
      createdAt: session.session.createdAt.toISOString(),
      expiresAt: session.session.expiresAt.toISOString(),
      updatedAt: session.session.updatedAt.toISOString(),
    },
    user: serializeAuthUser(session.user),
  };
}

function serializeAuthUser(user: AuthSession['user']) {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    thumbnailDataUrl: user.image ?? null,
    updatedAt: user.updatedAt.toISOString(),
  };
}

import { getUnseenChangelogs, markChangelogSeen } from '@pkg/core';
import { DateIso } from '@pkg/schema';
import { z } from 'zod';

import { protectedProcedure, router } from '../../trpc/init.js';

export const changelogRouter = router({
  unseen: protectedProcedure.query(({ ctx }) =>
    getUnseenChangelogs({
      accountCreatedAt: ctx.session.user.createdAt,
      appEnv: ctx.appEnv,
      changelogs: ctx.changelogLoader(),
      db: ctx.db,
      userId: ctx.session.user.id,
    }),
  ),
  markSeen: protectedProcedure.input(z.object({ releasedAt: DateIso })).mutation(async ({ ctx, input }) => {
    await markChangelogSeen({
      db: ctx.db,
      releasedAt: new Date(input.releasedAt),
      userId: ctx.session.user.id,
    });
  }),
});

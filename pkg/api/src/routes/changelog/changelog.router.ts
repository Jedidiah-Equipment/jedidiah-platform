import { getUnseenChangelogs, markChangelogSeen } from '@pkg/core';
import { Business, DateIso } from '@pkg/schema';
import { z } from 'zod';

import { mapCoreErrors } from '../../trpc/errors.js';
import { protectedProcedure, router } from '../../trpc/init.js';
import { changelogErrorFamily } from '../shared-error-families.js';

// Both reads take the business the caller is standing in as input, since one shared router serves both modes.
const changelogProcedure = protectedProcedure.input(z.object({ business: Business }));

export const changelogRouter = router({
  unseen: changelogProcedure.query(({ ctx, input }) =>
    getUnseenChangelogs({
      accountCreatedAt: ctx.session.user.createdAt,
      appEnv: ctx.appEnv,
      business: input.business,
      changelogs: ctx.changelogLoader(),
      db: ctx.db,
      userId: ctx.session.user.id,
    }),
  ),
  markSeen: changelogProcedure.input(z.object({ releasedAt: DateIso })).mutation(({ ctx, input }) =>
    mapCoreErrors(
      () =>
        markChangelogSeen({
          business: input.business,
          changelogs: ctx.changelogLoader(),
          db: ctx.db,
          releasedAt: new Date(input.releasedAt),
          userId: ctx.session.user.id,
        }),
      changelogErrorFamily,
    ),
  ),
});

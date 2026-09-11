import { type ChangelogCoreError, getUnseenChangelogs, isChangelogCoreError, markChangelogSeen } from '@pkg/core';
import { Business, DateIso } from '@pkg/schema';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { protectedProcedure, requireBusinessAccess, router } from '../../trpc/init.js';

/**
 * Both reads take the business the caller is standing in as input, since one shared router serves
 * both modes; a business the caller cannot access is forbidden, like any business-scoped procedure.
 */
const changelogProcedure = protectedProcedure.input(z.object({ business: Business })).use(({ ctx, input, next }) => {
  requireBusinessAccess(ctx.access, input.business);

  return next();
});

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
    mapChangelogErrors(() =>
      markChangelogSeen({
        business: input.business,
        changelogs: ctx.changelogLoader(),
        db: ctx.db,
        releasedAt: new Date(input.releasedAt),
        userId: ctx.session.user.id,
      }),
    ),
  ),
});

async function mapChangelogErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isChangelogCoreError, mapChangelogCoreError);
}

function mapChangelogCoreError(error: ChangelogCoreError): CoreErrorMapping<ChangelogCoreError['code']> {
  return changelogErrorMappings[error.code];
}

const changelogErrorMappings = {
  'changelog.unknown_release': {
    appCode: 'changelog.unknown_release',
    code: 'BAD_REQUEST',
    message: 'That release could not be found.',
  },
} satisfies {
  [TCode in ChangelogCoreError['code']]: CoreErrorMapping<TCode>;
};

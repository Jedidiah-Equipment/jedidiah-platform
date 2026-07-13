import { type ChangelogCoreError, getUnseenChangelogs, isChangelogCoreError, markChangelogSeen } from '@pkg/core';
import { DateIso } from '@pkg/schema';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
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
  markSeen: protectedProcedure.input(z.object({ releasedAt: DateIso })).mutation(({ ctx, input }) =>
    mapChangelogErrors(() =>
      markChangelogSeen({
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

import { listUsers } from '@pkg/core';

import { authorizedProcedure, router } from '../../trpc/init.js';

export const usersRouter = router({
  list: authorizedProcedure('user:list').query(({ ctx }) => listUsers({ db: ctx.db })),
});

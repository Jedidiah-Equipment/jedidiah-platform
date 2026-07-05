import { getAiDebugInfo } from '@pkg/ai';

import { protectedProcedure, router } from '../../trpc/init.js';

export const aiRouter = router({
  // Any signed-in user may inspect their own assistant context; the view is user-relative and
  // flags unauthorized tools rather than hiding them, so no per-tool permission gate here.
  debugInfo: protectedProcedure.query(({ ctx }) => getAiDebugInfo(ctx.access)),
});

import { type JohnDeereConnectionService, NOT_CONNECTED, notConfigured } from '@pkg/integrations/contracting';
import type { JohnDeereConnectionView } from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { johnDeereErrorFamily } from '../contracting-error-families.js';

export type JohnDeereDependencies = { connection: JohnDeereConnectionService };

const settingsProcedure = authorizedProcedure('contracting_settings:update');

export function createContractingJohnDeereRouter(deps: JohnDeereDependencies | null) {
  const connection = () => {
    if (!deps) throw notConfigured();
    return deps.connection;
  };

  return router({
    status: settingsProcedure.query(
      async (): Promise<JohnDeereConnectionView> =>
        deps
          ? { configured: true, ...(await deps.connection.getConnection()) }
          : { configured: false, ...NOT_CONNECTED },
    ),
    connect: router({
      start: settingsProcedure.mutation(({ ctx }) =>
        mapCoreErrors(() => connection().startConnect({ actorUserId: ctx.session.user.id }), johnDeereErrorFamily),
      ),
    }),
    disconnect: settingsProcedure.mutation(({ ctx }) =>
      mapCoreErrors(() => connection().disconnect({ actorUserId: ctx.session.user.id }), johnDeereErrorFamily),
    ),
  });
}

import {
  type JohnDeereConnectionService,
  type JohnDeereLinkService,
  type JohnDeerePoller,
  NOT_CONNECTED,
  notConfigured,
} from '@pkg/integrations/contracting';
import {
  type JohnDeereConnectionView,
  JohnDeereLinkCreateInput,
  JohnDeereLinkRemoveInput,
} from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { johnDeereErrorFamily } from '../contracting-error-families.js';

export type JohnDeereDependencies = {
  connection: JohnDeereConnectionService;
  links: JohnDeereLinkService;
  poller: JohnDeerePoller;
};

const settingsProcedure = authorizedProcedure('contracting_settings:update');
const machineProcedure = authorizedProcedure('contracting_machine:update');

export function createContractingJohnDeereRouter(deps: JohnDeereDependencies | null) {
  const run = <T>(action: (deps: JohnDeereDependencies) => Promise<T> | T) =>
    mapCoreErrors(async () => {
      if (!deps) throw notConfigured();
      return action(deps);
    }, johnDeereErrorFamily);

  return router({
    status: settingsProcedure.query(
      async (): Promise<JohnDeereConnectionView> =>
        deps
          ? { configured: true, ...(await deps.connection.getConnection()) }
          : { configured: false, ...NOT_CONNECTED },
    ),
    connect: router({
      start: settingsProcedure.mutation(({ ctx }) =>
        run(({ connection }) => connection.startConnect({ actorUserId: ctx.session.user.id })),
      ),
    }),
    disconnect: settingsProcedure.mutation(({ ctx }) =>
      run(({ connection }) => connection.disconnect({ actorUserId: ctx.session.user.id })),
    ),
    poll: router({
      now: settingsProcedure.mutation(() => run(({ poller }) => poller.runNow())),
    }),
    equipment: router({
      list: settingsProcedure.query(() => run(({ links }) => links.listUnlinkedMachines())),
    }),
    links: router({
      list: settingsProcedure.query(() => run(({ links }) => links.listLinks())),
      create: machineProcedure
        .input(JohnDeereLinkCreateInput)
        .mutation(({ ctx, input }) =>
          run(({ links }) => links.linkMachine({ actorUserId: ctx.session.user.id, ...input })),
        ),
      remove: machineProcedure
        .input(JohnDeereLinkRemoveInput)
        .mutation(({ ctx, input }) =>
          run(({ links }) => links.unlinkMachine({ actorUserId: ctx.session.user.id, linkId: input.id })),
        ),
    }),
  });
}

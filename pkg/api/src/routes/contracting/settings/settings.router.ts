import { getContractingSettings, updateContractingSettings } from '@pkg/core/contracting';
import { ContractingSettingsUpdateInput } from '@pkg/schema/contracting';
import { authorizedProcedure, router } from '../../../trpc/init.js';

/** No error family: the only refusals are the Zod bounds and the permission. */
export const contractingSettingsRouter = router({
  get: authorizedProcedure('contracting_settings:update').query(({ ctx }) => getContractingSettings({ db: ctx.db })),
  update: authorizedProcedure('contracting_settings:update')
    .input(ContractingSettingsUpdateInput)
    .mutation(({ ctx, input }) => updateContractingSettings({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
});

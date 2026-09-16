import {
  createMeasureType,
  createRate,
  getMeasureType,
  getRate,
  listMeasureTypes,
  listRates,
  patchMeasureType,
  patchRate,
  rateOptions,
  removeMeasureType,
  removeRate,
  reorderMeasureTypes,
  reorderRates,
} from '@pkg/core/contracting';
import { UUID } from '@pkg/schema';
import {
  MeasureTypeCreateInput,
  MeasureTypePatchInput,
  RateCreateInput,
  RateListInput,
  RatePatchInput,
  ReorderInput,
} from '@pkg/schema/contracting';
import { z } from 'zod';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { rateCardErrorFamily } from '../contracting-error-families.js';

const idInput = z.object({ id: UUID });

export const contractingRateCardRouter = router({
  rates: router({
    list: authorizedProcedure('contracting_rate:read')
      .input(RateListInput.optional())
      .query(({ ctx, input }) =>
        mapCoreErrors(() => listRates({ db: ctx.db, input: input ?? { status: 'all' } }), rateCardErrorFamily),
      ),
    options: authorizedProcedure('contracting_rate:read').query(({ ctx }) =>
      mapCoreErrors(() => rateOptions({ db: ctx.db }), rateCardErrorFamily),
    ),
    get: authorizedProcedure('contracting_rate:read')
      .input(idInput)
      .query(({ ctx, input }) => mapCoreErrors(() => getRate({ db: ctx.db, id: input.id }), rateCardErrorFamily)),
    create: authorizedProcedure('contracting_rate:update')
      .input(RateCreateInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => createRate({ db: ctx.db, actorUserId: ctx.session.user.id, input }), rateCardErrorFamily),
      ),
    patch: authorizedProcedure('contracting_rate:update')
      .input(RatePatchInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => patchRate({ db: ctx.db, actorUserId: ctx.session.user.id, input }), rateCardErrorFamily),
      ),
    reorder: authorizedProcedure('contracting_rate:update')
      .input(ReorderInput)
      .mutation(({ ctx, input }) => mapCoreErrors(() => reorderRates({ db: ctx.db, input }), rateCardErrorFamily)),
    remove: authorizedProcedure('contracting_rate:update')
      .input(idInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => removeRate({ db: ctx.db, actorUserId: ctx.session.user.id, id: input.id }),
          rateCardErrorFamily,
        ),
      ),
  }),
  measureTypes: router({
    list: authorizedProcedure('contracting_rate:read').query(({ ctx }) =>
      mapCoreErrors(() => listMeasureTypes({ db: ctx.db }), rateCardErrorFamily),
    ),
    get: authorizedProcedure('contracting_rate:read')
      .input(idInput)
      .query(({ ctx, input }) =>
        mapCoreErrors(() => getMeasureType({ db: ctx.db, id: input.id }), rateCardErrorFamily),
      ),
    create: authorizedProcedure('contracting_rate:update')
      .input(MeasureTypeCreateInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => createMeasureType({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
          rateCardErrorFamily,
        ),
      ),
    patch: authorizedProcedure('contracting_rate:update')
      .input(MeasureTypePatchInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => patchMeasureType({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
          rateCardErrorFamily,
        ),
      ),
    reorder: authorizedProcedure('contracting_rate:update')
      .input(ReorderInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => reorderMeasureTypes({ db: ctx.db, input }), rateCardErrorFamily),
      ),
    remove: authorizedProcedure('contracting_rate:update')
      .input(idInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => removeMeasureType({ db: ctx.db, actorUserId: ctx.session.user.id, id: input.id }),
          rateCardErrorFamily,
        ),
      ),
  }),
});

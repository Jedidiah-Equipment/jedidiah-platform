import {
  createStation,
  isStationCoreError,
  listStations,
  type StationCoreError,
  StationHardDeleteUnsupportedError,
  setStationActive,
  updateStation,
} from '@pkg/core';
import {
  StationCreateInput,
  StationDeleteInput,
  StationListInput,
  StationSetActiveInput,
  StationUpdateInput,
} from '@pkg/schema';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const stationsRouter = router({
  list: authorizedProcedure('job:read')
    .input(StationListInput)
    .query(({ ctx, input }) => listStations({ db: ctx.db, input })),

  create: authorizedProcedure('job:update')
    .input(StationCreateInput)
    .mutation(({ ctx, input }) =>
      mapStationErrors(() => createStation({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  update: authorizedProcedure('job:update')
    .input(StationUpdateInput)
    .mutation(({ ctx, input }) =>
      mapStationErrors(() => updateStation({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  setActive: authorizedProcedure('job:update')
    .input(StationSetActiveInput)
    .mutation(({ ctx, input }) =>
      mapStationErrors(() => setStationActive({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  delete: authorizedProcedure('job:update')
    .input(StationDeleteInput)
    .mutation(({ input }) =>
      mapStationErrors(async () => {
        throw new StationHardDeleteUnsupportedError(input.id);
      }),
    ),
});

async function mapStationErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isStationCoreError, mapStationCoreError);
}

function mapStationCoreError(error: StationCoreError): CoreErrorMapping<StationCoreError['code']> {
  switch (error.code) {
    case 'station.duplicate_name':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A station with this name already exists in that Department.',
      };
    case 'station.hard_delete_unsupported':
      return {
        appCode: error.code,
        code: 'METHOD_NOT_SUPPORTED',
        message: 'Stations cannot be hard deleted. Deactivate the station instead.',
      };
    case 'station.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Station not found.',
      };
    default:
      return assertNever(error);
  }
}

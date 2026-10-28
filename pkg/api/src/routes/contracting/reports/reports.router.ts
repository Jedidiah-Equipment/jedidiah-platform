import {
  getHoursHeatMap,
  getMechanicPerformance,
  getUtilisationReport,
  getUtilisationTrend,
} from '@pkg/core/contracting';
import { HoursHeatMapInput, ReportWindowInput, UtilisationTrendInput } from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { reportErrorFamily } from '../contracting-error-families.js';

export const contractingReportsRouter = router({
  hoursHeatMap: authorizedProcedure('contracting_report:read')
    .input(HoursHeatMapInput)
    .query(({ ctx, input }) => mapCoreErrors(() => getHoursHeatMap({ db: ctx.db, input }), reportErrorFamily)),
  mechanicPerformance: authorizedProcedure('contracting_report:read')
    .input(ReportWindowInput)
    .query(({ ctx, input }) => getMechanicPerformance({ db: ctx.db, input })),
  utilisation: authorizedProcedure('contracting_report:read')
    .input(ReportWindowInput)
    .query(({ ctx, input }) => mapCoreErrors(() => getUtilisationReport({ db: ctx.db, input }), reportErrorFamily)),
  utilisationTrend: authorizedProcedure('contracting_report:read')
    .input(UtilisationTrendInput)
    .query(({ ctx, input }) => mapCoreErrors(() => getUtilisationTrend({ db: ctx.db, input }), reportErrorFamily)),
});

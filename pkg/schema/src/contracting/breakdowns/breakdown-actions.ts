import { z } from 'zod';
import { actionVerdict, actionVerdicts } from '../../common/action-verdicts.js';

/** Every write a person can ask of a Breakdown; reads stay with the Breakdown read scope. */
export const breakdownActionNames = ['editReport', 'addPhotos', 'addNote', 'assignMechanic', 'start', 'solve'] as const;
export type BreakdownActionName = (typeof breakdownActionNames)[number];

export const BreakdownActionBlockedReason = z.enum(['no-permission', 'not-yours', 'solved', 'wrong-status']);
export type BreakdownActionBlockedReason = z.infer<typeof BreakdownActionBlockedReason>;

export const BreakdownActionVerdict = actionVerdict(BreakdownActionBlockedReason);
export type BreakdownActionVerdict = z.infer<typeof BreakdownActionVerdict>;

/** The Breakdown Actions verdicts for the person asking; permission sits inside them. */
export const BreakdownActions = actionVerdicts(breakdownActionNames, BreakdownActionVerdict);
export type BreakdownActions = z.infer<typeof BreakdownActions>;

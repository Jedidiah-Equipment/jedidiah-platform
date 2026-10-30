import { z } from 'zod';
import { requiredSelection } from '../../common/form.js';
import { UUID } from '../../common/uuid.js';
import { Quantity } from './job.js';

/** The Measure form as both the web and the phone hold it: an unchosen Measure Type is an empty string. */
export const MeasureValues = z.object({
  measureTypeId: requiredSelection(UUID, 'Choose a Measure Type'),
  quantity: Quantity,
});
export type MeasureValues = z.input<typeof MeasureValues>;

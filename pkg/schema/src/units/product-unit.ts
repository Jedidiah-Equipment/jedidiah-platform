import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../common/date.js';
import { nullableTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';
import { ProductSerialNumber, ProductSerialPrefix, ProductSerialSequence, ProductSerialYear } from '../jobs/job.js';

export type ProductUnitVinNumber = z.infer<typeof ProductUnitVinNumber>;
export const ProductUnitVinNumber = nullableTrimmedText();

export type ProductUnitTransferNote = z.infer<typeof ProductUnitTransferNote>;
export const ProductUnitTransferNote = nullableTrimmedText();

/**
 * One physical machine. It owns the identity a Job used to carry, so the serial survives every later
 * piece of work on the same unit. A Unit is created by its Build Job and never on its own.
 */
export type ProductUnit = z.infer<typeof ProductUnit>;
export const ProductUnit = z.object({
  id: UUID,
  productId: UUID,
  // productSerialNumber is the full frozen serial; prefix, sequence, and year store its component parts.
  productSerialNumber: ProductSerialNumber,
  productSerialPrefix: ProductSerialPrefix,
  productSerialSequence: ProductSerialSequence,
  productSerialYear: ProductSerialYear,
  vinNumber: ProductUnitVinNumber,
  createdAt: DateIso,
  updatedAt: DateIso,
});

/**
 * One assertion that a Product Unit changed hands. Append-only: a reversal, a resale, and a return to
 * Stock are all further rows. `fromCustomerId`/`toCustomerId` are `null` when we hold the machine, and
 * `actorUserId` is `null` when the system wrote the row rather than a person.
 */
export type ProductUnitOwnershipTransfer = z.infer<typeof ProductUnitOwnershipTransfer>;
export const ProductUnitOwnershipTransfer = z.object({
  id: UUID,
  productUnitId: UUID,
  fromCustomerId: UUID.nullable(),
  toCustomerId: UUID.nullable(),
  /** Plant business date the machine actually changed hands. */
  occurredOn: DateOnlyIso,
  sourceQuoteId: UUID.nullable(),
  actorUserId: AuthId.nullable(),
  note: ProductUnitTransferNote,
  createdAt: DateIso,
});

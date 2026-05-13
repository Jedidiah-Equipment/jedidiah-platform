import { z } from "zod";

export type Price = z.infer<typeof Price>;
export const Price = z.number().min(0, "Must be zero or greater");

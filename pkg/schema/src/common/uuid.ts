import { z } from "zod";

export type UUID = z.infer<typeof UUID>;
export const UUID = z.uuid();

import { z } from "zod";

export type Uuid = z.infer<typeof Uuid>;
export const Uuid = z.uuid();

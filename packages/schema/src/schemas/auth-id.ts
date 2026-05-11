import { z } from "zod";

// Better Auth owns these string IDs; app-owned database tables should prefer UUID defaults.
export const AuthIdSchema = z.string().trim().min(1);

export type AuthId = z.infer<typeof AuthIdSchema>;

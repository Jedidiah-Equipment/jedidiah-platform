import { z } from "zod";

export type AuthId = z.infer<typeof AuthId>;

// Better Auth owns these string IDs; app-owned database tables should prefer UUID defaults.
export const AuthId = z.string().trim().min(1);

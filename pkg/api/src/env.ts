import { NodeEnvSchema } from "@pkg/schema";
import { z } from "zod";

const TrustedOriginsSchema = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().url()).min(1));

const ApiEnvSchema = z.object({
  NODE_ENV: NodeEnvSchema.default("development"),
  DATABASE_URL: z.string().url(),
  TEST_DATABASE_URL: z.string().url().optional(),
  APP_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_TRUSTED_ORIGINS: TrustedOriginsSchema,
  PORT: z.coerce.number().int().positive().default(3000),
});

export type ApiConfig = z.infer<typeof ApiEnvSchema>;

export function getApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiEnvSchema.parse(env);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  getApiConfig();
}

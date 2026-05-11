import { NodeEnvSchema } from "@pkg/schema";
import { z } from "zod";

const DatabaseEnvSchema = z
  .object({
    NODE_ENV: NodeEnvSchema.default("development"),
    DATABASE_URL: z.string().url(),
    TEST_DATABASE_URL: z.string().url().optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "test" && !env.TEST_DATABASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["TEST_DATABASE_URL"],
        message: "TEST_DATABASE_URL is required when NODE_ENV=test",
      });
    }
  });

export type DatabaseConfig = z.infer<typeof DatabaseEnvSchema>;

export function getDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  return DatabaseEnvSchema.parse(env);
}

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const config = getDatabaseConfig(env);

  if (config.NODE_ENV === "test") {
    return config.TEST_DATABASE_URL ?? config.DATABASE_URL;
  }

  return config.DATABASE_URL;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  getDatabaseConfig();
}
